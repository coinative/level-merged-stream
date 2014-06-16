# level-merged-stream

[![Build Status](https://travis-ci.org/coinative/level-merged-stream.svg?branch=master)](https://travis-ci.org/coinative/level-merged-stream) [![Coverage Status](https://img.shields.io/coveralls/coinative/level-merged-stream.svg)](https://coveralls.io/r/coinative/level-merged-stream?branch=master)

A [LevelUP](https://github.com/rvagg/node-levelup) plugin to merge multiple ranges into a single sorted stream using a subkey for ordering. Useful when doing range queries against multiple key-based secondary indexes. Supports standard LevelUP stream options and naïve pagination via a `skip` option.

## Install

Not currently hosted on npmjs.org. Take this module as a git dependency via:

```
npm install level-merged-stream
```

## Usage

Given a LevelUP instance `db`:
```js
var mergedStream = require('level-merged-stream');

db = mergedStream(db);
```

## API

* <a href="#createMergedReadStream"><code>db.<b>createMergedReadStream()</b></code></a>
* <a href="#createMergedKeyStream"><code>db.<b>createMergedKeyStream()</b></code></a>
* <a href="#createMergedValueStream"><code>db.<b>createMergedValueStream()</b></code></a>

--------------------------------------------------------

<a name="createMergedReadStream"></a>
### db.createMergedReadStream([options])

As per [`db.createReadStream()`](https://github.com/rvagg/node-levelup/blob/master/README.md#createReadStream) but with the following additional options:

* `'ranges'` *(array)*: The `start`/`end` ranges as you'd provide to `createReadStream`. Each range is streamed and merged according to the value privided by `subkey`. Each range must be ordered by `subkey`, i.e. any range prefix must be constant for the entire range for overall ordering to be consistent.

* `'subkey'` *(function, default: identity)*: Selects the subkey from the key that is used for ordering the results.

* `'comparator'` *(function, default: primitive comparison)*: A subkey comparator function if primitive comparison is insufficient, .e.g. for Buffers or custom keys.

* `'dedupe'` *(boolean/function, default: `false`)*: If `true`, when two or more subkeys are considered equal, only the first result will be streamed. The key and/or value returned could come from any underlying range stream. If a function, it should return `true` if two keys passed are considered equal for deduplication purposes.

* `'skip'` *(number, default: `0`)*: The number of results to skip in the merged stream. Useful for pagination when also using `limit`.

--------------------------------------------------------
<a name="createMergedKeyStream"></a>
### db.createMergedKeyStream([options])

As per [`db.createKeyStream()`](https://github.com/rvagg/node-levelup/blob/master/README.md#createKeyStream) this streams only the keys.

--------------------------------------------------------
<a name="createMergedValueStream"></a>
### db.createMergedValueStream([options])

As per [`db.createValueStream()`](https://github.com/rvagg/node-levelup/blob/master/README.md#createValueStream) this streams only the values.

--------------------------------------------------------

## Example

`examples/readme.js`:
```js
var path = require('path');
var level = require('level');
var mergedStream = require('level-merged-stream');

var location = path.join(__dirname, '/.db');
var db = level(location);
db = mergedStream(db);

db.batch()
  .put('a1', '1')
  .put('b2', '2')
  .put('c3', '3')
  .put('d4', '4')
  .put('a5', '5')
  .put('b6', '6')
  .put('c7', '7')
  .put('d8', '8')
  .write(function () {
    db.mergedReadStream({
      // Only stream the 'a's and 'c's
      ranges: [
        { start: 'a', end: 'b' },
        { start: 'c', end: 'd' }
      ],
      // Ignore the first character for sorting
      subkey: function (key) {
        return key.slice(1);
      },
      skip: 1,
      limit: 2
    })
      .on('data', console.log)
      .on('end', function () {
        db.close(function () {
          level.destroy(location);
        });
      });
  });
```
Output:
```
{ key: 'c3', value: '3' }
{ key: 'a5', value: '5' }
```
## License

MIT
