var path = require('path');
var level = require('level');
var mergedStream = require('../');

var location = path.join(__dirname, '.test.db');

before(function (done) {
  level.destroy(location, done);
});
after(function (done) {
  level.destroy(location, done);
});

describe('level-merged-stream', function () {
  var db, ranges = [{ start: 'b', end: 'c' }, { start: 'c' }, { end: 'b' }, /* empty stream => */ { start: 'd', end: 'e' }];

  beforeEach(function (done) {
    level.destroy(location, function () {
      db = level(location);
      db = mergedStream(db);
      db.open(function () {
        db.batch()
          .put('a0', '0')
          .put('c1', '1')
          .put('b2', '2')
          .put('b3', '3')
          .put('a4', '4')
          .put('a5', '5')
          .put('c6', '6')
          .write(done);
      });
    });
  });

  afterEach(function (done) {
    db.close(done);
  });

  // Sort from the second character
  function comparator(x, y) {
    x = x.slice(1);
    y = y.slice(1);
    return x > y ? 1 : x < y ? -1 : 0;
  }

  describe('createMergedRangeStream', function () {
    it('should \'merge\' 1 stream', function (done) {
      var results = [];
      db.mergedReadStream({
        ranges: [ { start: 'c', end: 'd' }],
        comparator: comparator
      })
        .on('data', function (data) {
          results.push(data.value);
        })
        .on('end', function () {
          expect(results).to.deep.equal(['1', '6']);
          done();
        });
    });

    it('should merge 2 streams', function (done) {
      var results = [];
      db.mergedReadStream({
        ranges: [ { start: 'a', end: 'b' }, { start: 'c', end: 'd' }],
        comparator: comparator
      })
        .on('data', function (data) {
          results.push(data.value);
        })
        .on('end', function () {
          expect(results).to.deep.equal(['0', '1', '4', '5', '6']);
          done();
        });
    });

    it('should merge all streams', function (done) {
      var results = [];
      db.mergedReadStream({
        ranges: ranges,
        comparator: comparator
      })
        .on('data', function (data) {
          results.push(data.value);
        })
        .on('end', function () {
          expect(results).to.deep.equal(['0', '1', '2', '3', '4', '5', '6']);
          done();
        });
    });

    it('should be able to be ended early', function (done) {
      var results = [];
      var stream = db.mergedReadStream({
        ranges: ranges,
        comparator: comparator
      });
      stream
        .on('data', function (data) {
          results.push(data.value);
          if (results.length === 3) {
            stream.end();
          }
        })
        .on('end', function () {
          expect(results).to.deep.equal(['0', '1', '2']);
          done();
        });
    });

    it('should limit results', function (done) {
      var results = [];
      var stream = db.mergedReadStream({
        ranges: ranges,
        comparator: comparator,
        limit: 4
      });
      stream
        .on('data', function (data) {
          results.push(data.value);
        })
        .on('end', function () {
          expect(results).to.deep.equal(['0', '1', '2', '3']);
          done();
        });
    });

    it('should skip and limit results', function (done) {
      var results = [];
      var stream = db.mergedReadStream({
        ranges: ranges,
        comparator: comparator,
        skip: 3,
        limit: 3
      });
      stream
        .on('data', function (data) {
          results.push(data.value);
        })
        .on('end', function () {
          expect(results).to.deep.equal(['3', '4', '5']);
          done();
        });
    });

    it('should respect key and value encodings', function (done) {
      var letterPrefixEncoding = {
        encode : function (val) {
          return val.prefix + (val.value || '');
        },
        decode : function (val) {
          return { prefix: val[0], value: val.slice(1) };
        },
        buffer : false,
        type: 'letter-prefix'
      };
      var numberEncoding = {
        encode : function (val) {
          return val.toString();
        },
        decode : function (val) {
          return parseInt(val);
        },
        buffer : false,
        type: 'number'
      };
      var results = [];
      var stream = db.mergedReadStream({
        ranges: [{ start: { prefix: 'a' }, end: { prefix: 'a', value: '4' } }, { start: { prefix: 'c' } }],
        comparator: function (x, y) {
          return x.value > y.value ? 1 : x.value < y.value ? -1 : 0;
        },
        skip: 1,
        limit: 3,
        keyEncoding: letterPrefixEncoding,
        valueEncoding: numberEncoding
      });
      stream
        .on('data', function (data) {
          results.push(data.value);
        })
        .on('end', function () {
          expect(results).to.deep.equal([1, 4, 6]); // c1 a4 c6
          done();
        });
    });

    it('should order by key by default', function (done) {
      var results = [];
      db.mergedReadStream({
        ranges: ranges
      })
        .on('data', function (data) {
          results.push(data.key);
        })
        .on('end', function () {
          expect(results).to.deep.equal(['a0', 'a4', 'a5', 'b2', 'b3', 'c1', 'c6']);
          done();
        });
    });

    it('should fallback to createReadStream but allow skip and limit', function (done) {
      var results = [];
      db.mergedReadStream({
        skip: 2,
        limit: 3
      })
        .on('data', function (data) {
          results.push(data.key);
        })
        .on('end', function () {
          expect(results).to.deep.equal(['a5', 'b2', 'b3']);
          done();
        });
    });

    it('should return comparator duplicates (unordered)', function (done) {
      db.put('b0', '9', function () {
        var results = [];
        db.mergedReadStream({
          ranges: ranges,
          comparator: comparator,
          limit: 4
        })
          .on('data', function (data) {
            results.push(data.value);
          })
          .on('end', function () {
            // Since both a0 and b0 will be equal, we aren't guaranteed of their
            // ordering, so only assert on their presence
            expect(results.sort()).to.deep.equal(['0', '1', '2', '9']);
            done();
          });
      });
    });

    it('should return range duplicates (unordered) for default comparator', function (done) {
      db.put('b0', '9', function () {
        var results = [];
        db.mergedReadStream({
          ranges: [{ start: 'a', end: 'b' }, { start: 'a', end: 'b' }]
        })
          .on('data', function (data) {
            results.push(data.key);
          })
          .on('end', function () {
            expect(results).to.deep.equal(['a0', 'a0', 'a4', 'a4', 'a5', 'a5']);
            done();
          });
      });
    });

    it('should provide enough source stream results to meet skip & limit', function (done) {
      var results = [];
      db.mergedReadStream({
        ranges: ranges,
        comparator: comparator,
        skip: 3,
        limit: 1
      })
        .on('data', function (data) {
          results.push(data.value);
        })
        .on('end', function () {
          // If createReadStream limit was set to 1 and not 3 + 1, we'd get []
          // and not ['3'] because the 'b' stream would already have ended
          expect(results).to.deep.equal(['3']);
          done();
        });
    });
  });

  describe('createMergedKeyStream', function () {
    it('should emit only keys', function (done) {
      var results = [];
      db.mergedKeyStream({
        ranges: ranges,
        comparator: comparator
      })
        .on('data', function (data) {
          results.push(data);
        })
        .on('end', function () {
          expect(results).to.deep.equal(['a0', 'c1', 'b2', 'b3', 'a4', 'a5', 'c6']);
          done();
        });
    });
  });

  describe('createMergedValueStream', function () {
    it('should emit only value', function (done) {
      var results = [];
      db.mergedValueStream({
        ranges: ranges,
        comparator: comparator
      })
        .on('data', function (data) {
          results.push(data);
        })
        .on('end', function () {
          expect(results).to.deep.equal(['0', '1', '2', '3', '4', '5', '6']);
          done();
        });
    });
  });
});
