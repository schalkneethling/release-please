// Copyright 2019 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {readFileSync} from 'fs';
import {resolve} from 'path';
import * as snapshot from 'snap-shot-it';
import {describe, it} from 'mocha';
import * as nock from 'nock';
import {strictEqual} from 'assert';
nock.disableNetConnect();

import {GitHubRelease} from '../src/github-release';

const fixturesPath = './test/fixtures';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const repoInfo = require('../../test/fixtures/repo-get-2.json');

describe('GitHubRelease', () => {
  describe('createRelease', () => {
    it('creates and labels release on GitHub', async () => {
      const release = new GitHubRelease({
        label: 'autorelease: pending',
        repoUrl: 'googleapis/foo',
        packageName: 'foo',
        apiUrl: 'https://api.github.com',
      });
      const requests = nock('https://api.github.com')
        // check for default branch
        .get('/repos/googleapis/foo')
        .reply(200, repoInfo)
        .get(
          '/repos/googleapis/foo/pulls?state=closed&per_page=100&sort=merged_at&direction=desc'
        )
        .reply(200, [
          {
            labels: [{name: 'autorelease: pending'}],
            head: {
              label: 'head:release-v1.0.3',
            },
            base: {
              label: 'googleapis:main',
            },
            number: 1,
            merged_at: new Date().toISOString(),
          },
        ])
        .get('/repos/googleapis/foo/contents/CHANGELOG.md?ref=refs/heads/main')
        .reply(200, {
          content: Buffer.from('#Changelog\n\n## v1.0.3\n\n* entry', 'utf8'),
        })
        .post(
          '/repos/googleapis/foo/releases',
          (body: {[key: string]: string}) => {
            snapshot(body);
            return true;
          }
        )
        .reply(200, {tag_name: 'v1.0.2'})
        .post(
          '/repos/googleapis/foo/issues/1/labels',
          (body: {[key: string]: string}) => {
            snapshot(body);
            return true;
          }
        )
        .reply(200)
        .delete(
          '/repos/googleapis/foo/issues/1/labels/autorelease%3A%20pending'
        )
        .reply(200);

      const created = await release.createRelease();
      strictEqual(created!.tag_name, 'v1.0.2');
      requests.done();
    });

    it('attempts to guess package name for release', async () => {
      const release = new GitHubRelease({
        label: 'autorelease: pending',
        repoUrl: 'googleapis/foo',
        apiUrl: 'https://api.github.com',
        releaseType: 'node',
      });
      const requests = nock('https://api.github.com')
        // check for default branch
        .get('/repos/googleapis/foo')
        .reply(200, repoInfo)
        .get(
          '/repos/googleapis/foo/pulls?state=closed&per_page=100&sort=merged_at&direction=desc'
        )
        .reply(200, [
          {
            labels: [{name: 'autorelease: pending'}],
            head: {
              label: 'head:release-v1.0.3',
            },
            base: {
              label: 'googleapis:main',
            },
            number: 1,
            merged_at: new Date().toISOString(),
          },
        ])
        .get('/repos/googleapis/foo/contents/package.json?ref=refs/heads/main')
        .reply(200, {
          content: Buffer.from('{"name": "@google-cloud/foo"}', 'utf8'),
        })
        .get('/repos/googleapis/foo/contents/CHANGELOG.md?ref=refs/heads/main')
        .reply(200, {
          content: Buffer.from('#Changelog\n\n## v1.0.3\n\n* entry', 'utf8'),
        })
        .post(
          '/repos/googleapis/foo/releases',
          (body: {[key: string]: string}) => {
            snapshot(body);
            return true;
          }
        )
        .reply(200, {tag_name: 'v1.0.2'})
        .post(
          '/repos/googleapis/foo/issues/1/labels',
          (body: {[key: string]: string}) => {
            snapshot(body);
            return true;
          }
        )
        .reply(200)
        .delete(
          '/repos/googleapis/foo/issues/1/labels/autorelease%3A%20pending'
        )
        .reply(200);
      const created = await release.createRelease();
      strictEqual(created!.tag_name, 'v1.0.2');
      requests.done();
    });
  });

  describe('extractLatestReleaseNotes', () => {
    it('handles CHANGELOG with old and new format entries', () => {
      const changelogContent = readFileSync(
        resolve(fixturesPath, './CHANGELOG-old-new.md'),
        'utf8'
      ).replace(/\r\n/g, '\n');
      const latestReleaseNotes = GitHubRelease.extractLatestReleaseNotes(
        changelogContent,
        'v1.0.0'
      );
      snapshot(latestReleaseNotes);
    });

    it('handles CHANGELOG with old format entries', () => {
      const changelogContent = readFileSync(
        resolve(fixturesPath, './CHANGELOG-old.md'),
        'utf8'
      ).replace(/\r\n/g, '\n');
      const latestReleaseNotes = GitHubRelease.extractLatestReleaseNotes(
        changelogContent,
        'v2.1.0'
      );
      snapshot(latestReleaseNotes);
    });

    it('handles CHANGELOG with new format entries', () => {
      const changelogContent = readFileSync(
        resolve(fixturesPath, './CHANGELOG-new.md'),
        'utf8'
      ).replace(/\r\n/g, '\n');
      const latestReleaseNotes = GitHubRelease.extractLatestReleaseNotes(
        changelogContent,
        'v1.2.0'
      );
      snapshot(latestReleaseNotes);
    });

    // see: https://github.com/googleapis/release-please/issues/140
    it('extracts appropriate release notes when prior release is patch', () => {
      const changelogContent = readFileSync(
        resolve(fixturesPath, './CHANGELOG-bug-140.md'),
        'utf8'
      ).replace(/\r\n/g, '\n');
      const latestReleaseNotes = GitHubRelease.extractLatestReleaseNotes(
        changelogContent,
        'v5.0.0'
      );
      snapshot(latestReleaseNotes);
    });

    describe('php-yoshi', () => {
      it('extracts appropriate release notes, when multiple packages updated', () => {
        const changelogContent = readFileSync(
          resolve(fixturesPath, './CHANGELOG-php-yoshi.md'),
          'utf8'
        ).replace(/\r\n/g, '\n');
        const latestReleaseNotes = GitHubRelease.extractLatestReleaseNotes(
          changelogContent,
          'v0.105.0'
        );
        snapshot(latestReleaseNotes);
      });
    });
  });
});
