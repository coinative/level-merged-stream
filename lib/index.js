'use strict';

var through2 = require('through2');
var merge = require('mergesort-stream');
var offset = require('offset-stream');
var limit = require('limit-stream');
var extend = require('xtend');

function defaultSubkey(key) {
  return key;
}

function defaultComparator(x, y) {
  return x > y ? 1 : x < y ? -1 : 0;
}

function makeComparator(options) {
  var subkey = options.subkey || defaultSubkey;
  var comparator = options.comparator || defaultComparator;
  if (options.values) {
    return function (x, y) {
      x = subkey(x.key);
      y = subkey(y.key);
      return comparator(x, y);
    };
  }
  return function (x, y) {
    x = subkey(x);
    y = subkey(y);
    return comparator(x, y);
  };
}

// Our stream is ordered so we only need to check the previous result to
// detect duplicates
function makeDedupe(comparator) {
  var prev;
  return through2.obj(function (data, enc, callback) {
    if (!prev || comparator(prev, data) !== 0) {
      this.push(data);
    }
    prev = data;
    callback();
  });
};

function createMergedReadStream(db, options) {
  options = extend({ keys: true, values: true }, options);

  var overrides = {}, sources, stream;
  // Increase source-stream limit to guarantee enough results for skipping
  if (options.limit && options.skip) {
    overrides.limit = options.limit + options.skip;
  }
  var comparator = makeComparator(options);

  if (options.ranges) {
    // Force keys for comparator
    overrides.keys = true;
    sources = options.ranges.map(function (range) {
      return db.createReadStream(extend(options, range, overrides));
    });
    stream = merge(comparator, sources);
    if (options.dedupe) {
      stream = stream.pipe(makeDedupe(comparator));
    }
    // If we forced keys for the comparator, drop them now
    if (!options.keys && options.values) {
      stream = stream.pipe(through2.obj(function (data, enc, callback) {
        this.push(data.value);
        callback();
      }));
    }
  } else {
    stream = db.createReadStream(extend(options, overrides));
    sources = [stream];
    if (options.dedupe) {
      stream = stream.pipe(makeDedupe(comparator));
    }
  }
  if (options.skip) {
    stream = stream.pipe(offset(options.skip));
  }
  if (options.limit) {
    stream = stream.pipe(limit(options.limit));
  }
  stream.on('end', function () {
    sources.forEach(function (source) {
      source.destroy();
    });
  });
  return stream;
}

function setup(db) {
  db.createMergedReadStream = db.mergedReadStream = function (options) {
    return createMergedReadStream(db, options);
  };
  db.createMergedKeyStream = db.mergedKeyStream = function (options) {
    return createMergedReadStream(db, extend(options, { keys: true, values: false }));
  };
  db.createMergedValueStream = db.mergedValueStream = function (options) {
    return createMergedReadStream(db, extend(options, { keys: false, values: true }));
  };
  return db;
}

module.exports = setup;
