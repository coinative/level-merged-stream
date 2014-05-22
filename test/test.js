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

  // Ignore the first character for sorting
  function subkey(key) {
    return key.slice(1);
  }

  describe('createMergedRangeStream', function () {
    it('should \'merge\' 1 stream', function (done) {
      var results = [];
      db.mergedReadStream({
        ranges: [ { start: 'c', end: 'd' }],
        subkey: subkey
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
        subkey: subkey
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
        subkey: subkey
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
        subkey: subkey
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
        subkey: subkey,
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
        subkey: subkey,
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
        subkey: function (key) {
          return key.value;
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

    it('should return subkey duplicates (unordered)', function (done) {
      db.put('b0', '9', function () {
        var results = [];
        db.mergedReadStream({
          ranges: ranges,
          subkey: subkey,
          limit: 4
        })
          .on('data', function (data) {
            results.push(data.key);
          })
          .on('end', function () {
            // Since both a0 and b0 will be equal, we aren't guaranteed of their
            // ordering, so only assert on their presence
            expect(results.sort()).to.deep.equal(['a0', 'b0', 'b2', 'c1']);
            done();
          });
      });
    });

    it('should return range duplicates (unordered) for default subkey', function (done) {
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

    it('should not return range duplicates when dedupe specified', function (done) {
      db.put('b0', '9', function () {
        var results = [];
        db.mergedReadStream({
          ranges: [{ start: 'a', end: 'b' }, { start: 'a', end: 'b' }],
          dedupe: true
        })
          .on('data', function (data) {
            results.push(data.key);
          })
          .on('end', function () {
            expect(results).to.deep.equal(['a0', 'a4', 'a5']);
            done();
          });
      });
    });

    it('should not return duplicates when dedupe specified for single stream', function (done) {
      db.put('d6', '6', function () {
        var results = [];
        db.mergedReadStream({
          start: 'c6',
          subkey: subkey,
          dedupe: true
        })
          .on('data', function (data) {
            results.push(data.key);
          })
          .on('end', function () {
            // We should be missing 'd6' as it's subkey is equal to 'c6'
            expect(results).to.deep.equal(['c6']);
            done();
          });
      });
    });

    it('should provide enough source stream results to meet skip & limit', function (done) {
      var results = [];
      db.mergedReadStream({
        ranges: ranges,
        subkey: subkey,
        skip: 3,
        limit: 1
      })
        .on('data', function (data) {
          results.push(data.value);
        })
        .on('end', function () {
          // If createReadStream limit was set to 1 the 'b' stream would end
          // before we received 'b3'
          expect(results).to.deep.equal(['3']);
          done();
        });
    });

    it('should allow custom comparator', function (done) {
      var results = [];
      db.mergedReadStream({
        ranges: ranges,
        subkey: function (key) {
          return [key[0], parseInt(key.slice(1))];
        },
        comparator: function (x, y) {
          return x[1] > y[1] ? 1 : x[1] < y[1] ? -1 : 0;
        }
      })
        .on('data', function (data) {
          results.push(data.value);
        })
        .on('end', function () {
          expect(results).to.deep.equal(['0', '1', '2', '3', '4', '5', '6']);
          done();
        });
    });
  });

  describe('createMergedKeyStream', function () {
    it('should emit only keys', function (done) {
      var results = [];
      db.mergedKeyStream({
        ranges: ranges,
        subkey: subkey
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
        subkey: subkey
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
