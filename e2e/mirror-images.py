"""Emit approved source/target pairs; optional exact-target mirror, no engine I/O."""
import argparse
import json
from pathlib import Path


def pairs(manifest, target=''):
    images = manifest['images']
    if target:
        images = [image for image in images if image['target'] == target]
        if len(images) != 1:
            raise ValueError('mirror target must identify exactly one manifest entry')
    if not images:
        raise ValueError('empty mirror manifest')
    return [(image['source'], image['target']) for image in images]


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--target', default='')
    args = parser.parse_args()
    for source, target in pairs(json.loads(Path(__file__).with_name('mirror-images.json').read_bytes()), args.target):
        print(source + '\t' + target)
