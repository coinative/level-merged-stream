var path = require('path');
var level = require('level');
var mergedStream = require('../');

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

