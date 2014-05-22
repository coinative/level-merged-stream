'use strict';

var through = require('through');
var mergeStream = require('mergesort-stream');
var offset = require('offset-stream');
var limit = require('limit-stream');
var extend = require('xtend');

function defaultComparitor(x, y) {
  return x > y ? 1 : x < y ? -1 : 0;
}

function makeComparitor(options) {
  var comparitor = options.comparitor || defaultComparitor;
  if (options.values) {
    return function (x, y) {
      return comparitor(x.key, y.key);
    };
  }
  return comparitor;
}

function createMergedReadStream(db, options) {
  options = options || {};

  if (!options.ranges || options.ranges.length === 0) {
    return db.createReadStream(options);
  }

  options = extend({ keys: true, values: true }, options);
  var comparitor = makeComparitor(options);

  var sourceStreams = options.ranges.map(function (range) {
    // Force keys for comparison
    return db.createReadStream(extend(options, range, { keys: true }));
  });
  var stream = mergeStream(comparitor, sourceStreams);
  if (options.skip) {
    stream = stream.pipe(offset(options.skip));
  }
  if (options.limit) {
    stream = stream.pipe(limit(options.limit));
  }
  if (!options.keys && options.values) {
    stream = stream.pipe(through(function (data) {
      this.queue(data.value);
    }));
  }
  stream.on('end', function () {
    sourceStreams.forEach(function (source) {
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
