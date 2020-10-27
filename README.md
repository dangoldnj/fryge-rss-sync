# fryge-rss-sync

## Its Purpose

  `fryge-rss-sync` exists to create and maintain a long-term local repository composed of all data from a configured set of RSS feeds.

## The Basics

  Run via `npm run start`. It will parse `feeds.json` and scan each RSS feed to download new files locally, and then quit.

  🗓 A service-based resident version with time-of-day scheduling is looming large on the roadmap.

## Why Another Downloader?

  ⏳ A combination of lots of factors led to this project existing, but the basic reason is "longer term thinking".

  * Existing podcast software seems to facilitate two main functions in varying degrees:\
  A) browse for a podcast and listen to an episode now, caching the file on the device used to play it\
  B) curate a personal list of podcasts, downloading new content as it is released, building up a library of content over time

  * Podcasts themselves also have varying strategies for how they structure the available content:\
  A) "The Public Library" / Soapbox: a continguous list of all episodes forever, for free\
  B) "The Daily Attention Grab": content available for a limited time, often just one day, and then gone for good\
  C) "The Sampling": a subset of the full podcast's content available for free, to entice users to purchase a membership to the full back catalog\
  ... etc

  * If an item disappears from any individual podcast RSS feed, what are my options to listen to that file again, or view/know any metadata about my possibly cached downloaded files?\
  🤷‍

  🌟 When downloading episodes with this script, it will store the specified `enclosure` file itself as the primary disk artifact, and it will also store the full rss item data as JSON in a `metadata` subdirectory for later use independent of the feed's contents.

## Requirements

  You must have a working `node` environment with `yarn` installed.

## Installation

  Clone the repo, run `yarn install`, modify `feeds.json` to your liking, and run `yarn start` to scan all the feeds and download new files.

## Configuration

  The default download policy is presently set at runtime to:
  ```
  const defaultPolicy = {
    downloadRoot: path.join(os.homedir(), 'podcasts'),
    fetchAllItems: false,
    oldestDownload: new Date(2016, 10, 1),
  };

  ```

  You may modify the default policy as needed in `helpers/rss/getDefaultPolicy.js`.

  You may also provide overrides within `feeds.json`

  Also, you may include two different `policy` keys in your `feeds.json` that will use any provided object fields to override the defaultPolicy on a per-feed basis.

## Roadmap

  v0.1.0: Better in-progress download feedback\
  v0.2.0: Automatic download on a schedule\
  v0.3.0: UI for configuration and library interaction

## Release History

  v0.0.1: 7/6/2018 - Initial release - "better than the failing previous tool in use"

## Troubleshooting

  Any problems or questions? Let me know in an [issue](https://github.com/dangoldnj/fryge-rss-sync/issues).
