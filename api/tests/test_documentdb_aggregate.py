"""Tests for the aggregate verb: pipeline sandbox validation, scoping, metering."""

from unittest.mock import MagicMock, patch

import pytest

import app.exceptions as exceptions
import app.settings as settings
from app.services import documentdb


class TestValidatePipeline:
    def test_allows_planned_stages(self):
        pipeline = [
            {"$match": {"tags": "music"}},
            {"$unwind": "$tags"},
            {"$group": {"_id": "$tags", "n": {"$sum": 1}}},
            {"$sort": {"n": -1}},
            {"$skip": 1},
            {"$limit": 10},
            {"$project": {"n": 1}},
            {"$addFields": {"kind": "tag"}},
            {"$count": "total"},
        ]
        assert documentdb.validate_pipeline(pipeline) is None

    def test_allows_sample_bucket_facet(self):
        pipeline = [
            {
                "$facet": {
                    "sampled": [{"$sample": {"size": 5}}],
                    "buckets": [
                        {"$bucket": {"groupBy": "$year", "boundaries": [2000, 2010, 2020], "default": "other"}}
                    ],
                }
            },
        ]
        assert documentdb.validate_pipeline(pipeline) is None

    def test_rejects_non_list(self):
        with pytest.raises(Exception) as e:
            documentdb.validate_pipeline({"$match": {}})
        assert e.value is exceptions.PIPELINE

    def test_rejects_multi_key_stage(self):
        with pytest.raises(Exception) as e:
            documentdb.validate_pipeline([{"$match": {}, "$limit": 1}])
        assert e.value is exceptions.PIPELINE

    def test_rejects_non_dict_stage(self):
        with pytest.raises(Exception) as e:
            documentdb.validate_pipeline(["$match"])
        assert e.value is exceptions.PIPELINE

    @pytest.mark.parametrize(
        "stage",
        [
            {"$lookup": {"from": "otheruser"}},
            {"$graphLookup": {"from": "otheruser"}},
            {"$unionWith": "otheruser"},
            {"$out": "otheruser"},
            {"$merge": {"into": "otheruser"}},
            {"$replaceRoot": {"newRoot": "$secret"}},
            {"$collStats": {}},
            {"$currentOp": {}},
        ],
    )
    def test_rejects_forbidden_or_unknown_stages(self, stage):
        with pytest.raises(Exception):
            documentdb.validate_pipeline([stage])

    def test_rejects_where_inside_match(self):
        with pytest.raises(Exception) as e:
            documentdb.validate_pipeline([{"$match": {"$where": "this.a > 1"}}])
        assert e.value is exceptions.PIPELINE

    def test_rejects_function_inside_group(self):
        pipeline = [{"$group": {"_id": None, "x": {"$function": {"body": "f", "args": [], "lang": "js"}}}}]
        with pytest.raises(Exception) as e:
            documentdb.validate_pipeline(pipeline)
        assert e.value is exceptions.PIPELINE

    def test_rejects_accumulator_inside_group(self):
        pipeline = [{"$group": {"_id": None, "x": {"$accumulator": {}}}}]
        with pytest.raises(Exception) as e:
            documentdb.validate_pipeline(pipeline)
        assert e.value is exceptions.PIPELINE

    def test_rejects_forbidden_nested_in_facet(self):
        pipeline = [{"$facet": {"leak": [{"$lookup": {"from": "otheruser"}}]}}]
        with pytest.raises(Exception):
            documentdb.validate_pipeline(pipeline)

    def test_rejects_forbidden_deep_in_expression(self):
        pipeline = [{"$addFields": {"x": {"$map": {"input": "$a", "in": {"$lookup": {}}}}}}]
        with pytest.raises(Exception) as e:
            documentdb.validate_pipeline(pipeline)
        assert e.value is exceptions.PIPELINE

    def test_rejects_too_many_stages(self):
        pipeline = [{"$match": {}}] * (int(settings.AGG_MAX_STAGES) + 1)
        with pytest.raises(Exception) as e:
            documentdb.validate_pipeline(pipeline)
        assert e.value is exceptions.PIPELINE_CAP

    def test_rejects_limit_above_ceiling(self):
        with pytest.raises(Exception) as e:
            documentdb.validate_pipeline([{"$limit": int(settings.AGG_MAX_DOCS) + 1}])
        assert e.value is exceptions.PIPELINE_CAP

    def test_rejects_non_int_limit(self):
        with pytest.raises(Exception) as e:
            documentdb.validate_pipeline([{"$limit": "9999999"}])
        assert e.value is exceptions.PIPELINE_CAP

    def test_rejects_non_dict_facet(self):
        with pytest.raises(Exception) as e:
            documentdb.validate_pipeline([{"$facet": [{"$match": {}}]}])
        assert e.value is exceptions.PIPELINE


class TestAggregate:
    def _run(self, pipeline, results=None):
        mock_col = MagicMock()
        mock_col.aggregate.return_value = iter(results or [])
        with patch.object(documentdb.db, "__getitem__", return_value=mock_col):
            out = documentdb.aggregate("alice", "posts", pipeline)
        return mock_col, out

    def test_prepends_scoping_stages(self):
        user_pipeline = [{"$match": {"title": "hi"}}]
        mock_col, _ = self._run(user_pipeline)
        sent = mock_col.aggregate.call_args.args[0]
        # service scoping + star exclusion come first, unescapably
        assert sent[0] == {"$match": {"service": "posts", "body.service": {"$ne": "*"}}}
        # docs are rebased to body before any user stage runs
        assert sent[1] == {"$addFields": {"body._id": {"$toString": "$_id"}}}
        assert sent[2] == {"$replaceRoot": {"newRoot": "$body"}}
        assert sent[3:] == user_pipeline

    def test_passes_resource_caps(self):
        mock_col, _ = self._run([])
        kwargs = mock_col.aggregate.call_args.kwargs
        assert kwargs["maxTimeMS"] == int(settings.AGG_MAX_TIME_MS)
        assert kwargs["allowDiskUse"] is False

    def test_caps_returned_docs(self):
        docs = [{"i": i} for i in range(int(settings.AGG_MAX_DOCS) + 50)]
        _, out = self._run([], results=docs)
        assert len(out) == int(settings.AGG_MAX_DOCS)

    def test_invalid_pipeline_never_hits_db(self):
        mock_col = MagicMock()
        with patch.object(documentdb.db, "__getitem__", return_value=mock_col):
            with pytest.raises(Exception):
                documentdb.aggregate("alice", "posts", [{"$out": "bob"}])
        mock_col.aggregate.assert_not_called()


class TestChargeUnits:
    def test_charge_default_single_unit(self):
        with patch.object(documentdb.db, "__getitem__") as mock_col:
            documentdb.charge("alice", "read")
            update = mock_col.return_value.update_one.call_args.args[1]
            assert update["$inc"]["body.credits_spent"] == pytest.approx(float(settings.COST["read"]))

    def test_charge_aggregate_scales_with_stages(self):
        with patch.object(documentdb.db, "__getitem__") as mock_col:
            documentdb.charge("alice", "aggregate", 7)
            update = mock_col.return_value.update_one.call_args.args[1]
            assert update["$inc"]["body.credits_spent"] == pytest.approx(7 * float(settings.COST["aggregate"]))
