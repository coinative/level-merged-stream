'use strict';

var through = require('through');
var merge = require('mergesort-stream');
var offset = require('offset-stream');
var limit = require('limit-stream');
var extend = require('xtend');

function defaultComparator(x, y) {
  return x > y ? 1 : x < y ? -1 : 0;
}

function makeComparator(options) {
  var comparator = options.comparator || defaultComparator;
  if (options.values) {
    return function (x, y) {
      return comparator(x.key, y.key);
    };
  }
  return comparator;
}

function createMergedReadStream(db, options) {
  options = extend({ keys: true, values: true }, options);

  var overrides = {}, sources, stream;
  // Increase source-stream limit to guarantee enough results for skipping
  if (options.limit && options.skip) {
    overrides.limit = options.limit + options.skip;
  }

  if (options.ranges) {
    // Force keys for comparator
    overrides.keys = true;
    sources = options.ranges.map(function (range) {
      return db.createReadStream(extend(options, range, overrides));
    });
    stream = merge(makeComparator(options), sources);
    // If we forced keys for the comparator, drop them now
    if (!options.keys && options.values) {
      stream = stream.pipe(through(function (data) {
        this.queue(data.value);
      }));
    }
  } else {
    stream = db.createReadStream(extend(options, overrides));
    sources = [stream];
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
