# Demonstration Source and Artifact Map

Source snapshot: `317fa349eae714ddde07f249ca65cdaa34b6459b`, counted 28 October
2026. Links below pin the implementation, not a claim about the deployed revision.

## What the Demonstration Establishes

web10-social is an application built on web10, not a second implementation of
the node. Its persistent social data and authentication use web10 APIs and the
SDK. Feed definitions, document conventions and interactions live in the browser
application; it has no separate application-specific social-data service.

The React SPA builds to static files and can be served separately from the node,
including through object storage plus HTTPS/CDN and SPA route handling. This is
backendless from the application developer's perspective: the web10 node remains
the backend. The current container also includes a Node crawler-card renderer;
static-only hosting would need a separate arrangement for that presentation
feature. Direct transfers to API-issued object-storage URLs, SDK-based peer
traffic, optional telemetry and external embeds are not an all-traffic-through-
the-API claim. This is source-backed architecture, not a completed S3 deployment
experiment or exhaustive runtime network audit.

## Killer-App Scope

web10-social is the project's attempt at a killer app for an open,
decentralized application ecosystem. It has not achieved mass adoption. Its
role in this paper is to demonstrate breadth: community/text discussion
(familiar from Facebook and Threads), image/mixed-media posts (Instagram),
vertical short video (TikTok), long-form watch pages (YouTube), and audio-track
browsing/playback (YouTube Music). These are implemented interaction patterns,
not a verified feature-parity matrix, catalog/algorithm comparison, adoption
result or claim of equivalent scale. The paper links the corresponding source
surfaces at the snapshot below.

## Application-Local Source Size

Physical lines include comments, blank lines and any unterminated final line.
They are not code-only SLOC or a productivity/complexity measurement.

| Scope Within `marketing/web10-social/` | Files | Physical Lines |
|---|---:|---:|
| Frontend `src/` TypeScript/TSX, including declarations, excluding tests | 140 | 45,846 |
| Frontend `src/` CSS | 1 | 439 |
| **Frontend subtotal** | **141** | **46,285** |
| `src/` tests (`__tests__`, `.test.*`, `.spec.*`) | 105 | 31,060 |
| `preview/` JavaScript modules | 3 | 431 |
| Other local source/tooling with the extensions selected below | 17 | 2,971 |
| **Selected application-local source total** | **266** | **80,747** |

The total is not the folder's byte count or every tracked file's line count.
Exclude all `public/` content (including SDK copies, workers and vendor assets),
lockfiles, JSON/HTML/nginx configuration, documentation, images, generated build
output and dependencies. The source total includes only the listed extensions.
The frontend also imports `marketing/shared/discover` and `sdk`; those sibling
implementations are deliberately outside these application-local counts.

Reproduce from the repository root with Ruby and Git, without a checkout,
dependency install or build:

```ruby
require 'json'
require 'open3'
ref = '317fa349eae714ddde07f249ca65cdaa34b6459b'
root = 'marketing/web10-social/'
paths, status = Open3.capture2('git', 'ls-tree', '-r', '--name-only', ref, '--', root)
abort 'inventory failed' unless status.success?
groups = Hash.new { |h, k| h[k] = [] }
paths.lines.map(&:chomp).each do |path|
  next unless path.match?(/\.(ts|tsx|css|js|mjs|sh)$/)
  next if path.start_with?(root + 'public/')
  category = if path.start_with?(root + 'src/') &&
      (path.include?('/__tests__/') || path.match?(/\.(test|spec)\.[^.]+$/))
    'tests'
  elsif path.start_with?(root + 'src/') && path.end_with?('.css')
    'frontend_css'
  elsif path.start_with?(root + 'src/') && path.match?(/\.tsx?$/)
    'frontend_ts_tsx'
  elsif path.start_with?(root + 'preview/') && path.end_with?('.mjs')
    'preview'
  else
    'other_local_source'
  end
  groups[category] << path
end
puts JSON.pretty_generate(groups.transform_values do |files|
  lines = files.sum do |path|
    text, ok = Open3.capture2('git', 'show', "#{ref}:#{path}")
    abort 'source read failed' unless ok.success?
    text.lines.count
  end
  { files: files.length, physical_lines: lines }
end)
```

## Pinned Implementation and Experiment Links

- [Social application](https://github.com/jacoby149/web10/tree/317fa349eae714ddde07f249ca65cdaa34b6459b/marketing/web10-social/src): interface and app-defined social data operations.
- [Data client](https://github.com/jacoby149/web10/blob/317fa349eae714ddde07f249ca65cdaa34b6459b/marketing/web10-social/src/data/v3.ts) and [feed](https://github.com/jacoby149/web10/blob/317fa349eae714ddde07f249ca65cdaa34b6459b/marketing/web10-social/src/data/feed.ts): SDK initialization and current application query sequence.
- [Node API](https://github.com/jacoby149/web10/tree/317fa349eae714ddde07f249ca65cdaa34b6459b/api/app) and [SDK](https://github.com/jacoby149/web10/tree/317fa349eae714ddde07f249ca65cdaa34b6459b/sdk/src): platform implementation, separate from the demonstration frontend.
- [Query endpoint](https://github.com/jacoby149/web10/blob/317fa349eae714ddde07f249ca65cdaa34b6459b/api/app/v3/endpoints/query.py) and [compiler](https://github.com/jacoby149/web10/blob/317fa349eae714ddde07f249ca65cdaa34b6459b/api/app/v3/services/safe_query.py): policy orchestration and boundary CTE construction.
- [Shared UI library](https://github.com/jacoby149/web10/tree/317fa349eae714ddde07f249ca65cdaa34b6459b/marketing/shared/discover/src) and [preview renderer](https://github.com/jacoby149/web10/tree/317fa349eae714ddde07f249ca65cdaa34b6459b/marketing/web10-social/preview): dependencies and presentation code outside the frontend subtotal.
- [Social gauntlets](https://github.com/jacoby149/web10/tree/317fa349eae714ddde07f249ca65cdaa34b6459b/e2e/tests/gauntlets): reusable account/feed/post/reaction correctness scenarios, not yet an executed DigitalOcean load evaluation.
- [DigitalOcean experiment scaffold and blockers](https://github.com/jacoby149/web10/tree/317fa349eae714ddde07f249ca65cdaa34b6459b/research/experiments) and [evaluation plan](https://github.com/jacoby149/web10/blob/317fa349eae714ddde07f249ca65cdaa34b6459b/research/evaluation-plan.md): pending experiments, not published results.
