# @coinative/level-merged-stream

[![Build Status](https://travis-ci.org/coinative/level-merged-stream.svg?branch=master)](https://travis-ci.org/coinative/level-merged-stream) [![Coverage Status](https://img.shields.io/coveralls/coinative/level-merged-stream.svg)](https://coveralls.io/r/coinative/level-merged-stream?branch=master)

A [LevelUP](https://github.com/rvagg/node-levelup) plugin to merge multiple ranges into a single sorted stream. Useful when doing range queries against multiple key-based secondary indexes. Supports standard LevelUP stream options and naïve pagination via a `skip` option.

## Install

Not currently hosted on npmjs.org. Take this module as a git dependency via:

```
npm install coinative/level-merged-stream
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

* `'ranges'`: an array of `start`/`end` pairs as you'd use in `createReadStream`. Each range is streamed and merged in the order defined by `comparator`.

* `'comparator'`: a key comparator function. This defines the sort order of the resulting merged stream. If not specified results are sorted via a basic comparator function (which significantly limits it's usefulness).

* `'skip'` *(number, default: `0`)*: the number of results to skip in the merged stream. Useful for pagination when also using `limit`.

--------------------------------------------------------
<a name="createMergedKeyStream"></a>
### db.createMergedKeyStream([options])

As per [`db.createKeyStream()`](https://github.com/rvagg/node-levelup/blob/master/README.md#createKeyStream) this streams only the keys.

--------------------------------------------------------
<a name="createMergedValueStream"></a>
### db.createMergedValueStream([options])

As per [`db.createValueStream()`](https://github.com/rvagg/node-levelup/blob/master/README.md#createValueStream) this streams only the values.

--------------------------------------------------------

## Examaple

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
      comparator: function (x, y) {
        x = x.slice(1);
        y = y.slice(1);
        return x > y ? 1 : x < y ? -1 : 0;
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
