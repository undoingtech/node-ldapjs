// Copyright 2011 Mark Cavage, Inc.  All rights reserved.

var test = require('tape').test;

var asn1 = require('asn1');


///--- Globals

var BerReader = asn1.BerReader;
var BerWriter = asn1.BerWriter;
var Attribute;
var Change;


///--- Tests

test('load library', function (t) {
  Attribute = require('../lib/index').Attribute;
  Change = require('../lib/index').Change;
  t.ok(Attribute);
  t.ok(Change);
  t.end();
});


test('new no args', function (t) {
  t.ok(new Change());
  t.end();
});


test('new with args', function (t) {
  var change = new Change({
    operation: 0x00,
    modification: new Attribute({
      type: 'cn',
      vals: ['foo', 'bar']
    })
  });
  t.ok(change);

  t.equal(change.operation, 'add');
  t.equal(change.modification.type, 'cn');
  t.equal(change.modification.vals.length, 2);
  t.equal(change.modification.vals[0], 'foo');
  t.equal(change.modification.vals[1], 'bar');

  t.end();
});


test('GH-31 (multiple attributes per Change)', function (t) {
  try {
    t.notOk(new Change({
      operation: 'replace',
      modification: {
        cn: 'foo',
        sn: 'bar'
      }
    }), 'should have thrown');
  } catch (e) {
    t.ok(e);
    t.end();
  }
});


test('toBer', function (t) {
  var change = new Change({
    operation: 'Add',
    modification: new Attribute({
      type: 'cn',
      vals: ['foo', 'bar']
    })
  });
  t.ok(change);

  var ber = new BerWriter();
  change.toBer(ber);
  var reader = new BerReader(ber.buffer);
  t.ok(reader.readSequence());
  t.equal(reader.readEnumeration(), 0x00);
  t.ok(reader.readSequence());
  t.equal(reader.readString(), 'cn');
  t.equal(reader.readSequence(), 0x31); // lber set
  t.equal(reader.readString(), 'foo');
  t.equal(reader.readString(), 'bar');
  t.end();
});


test('parse', function (t) {
  var ber = new BerWriter();
  ber.startSequence();
  ber.writeEnumeration(0x00);
  ber.startSequence();
  ber.writeString('cn');
  ber.startSequence(0x31);
  ber.writeStringArray(['foo', 'bar']);
  ber.endSequence();
  ber.endSequence();
  ber.endSequence();

  var change = new Change();
  t.ok(change);
  t.ok(change.parse(new BerReader(ber.buffer)));

  t.equal(change.operation, 'add');
  t.equal(change.modification.type, 'cn');
  t.equal(change.modification.vals.length, 2);
  t.equal(change.modification.vals[0], 'foo');
  t.equal(change.modification.vals[1], 'bar');

  t.end();
});


test('apply - replace', function (t) {
  var res;
  var single = new Change({
    operation: 'replace',
    modification: {
      type: 'cn',
      vals: ['new']
    }
  });
  var twin = new Change({
    operation: 'replace',
      modification: {
        type: 'cn',
        vals: ['new', 'two']
      }
  });

  // plain
  res = Change.apply(single, { cn: ['old'] });
  t.ok(res.cn);
  t.equal(res.cn.length, 1);
  t.equal(res.cn[0], 'new');

  // multiple
  res = Change.apply(single, { cn: ['old', 'also'] });
  t.ok(res.cn);
  t.equal(res.cn.length, 1);
  t.equal(res.cn[0], 'new');

  //absent
  res = Change.apply(single, { dn: ['otherjunk'] });
  t.ok(res.cn);
  t.equal(res.cn.length, 1);
  t.equal(res.cn[0], 'new');

  // scalar formatting "success"
  res = Change.apply(single, { cn: 'old' }, true);
  t.ok(res.cn);
  t.equal(res.cn, 'new');

  // scalar formatting "failure"
  res = Change.apply(twin, { cn: 'old' }, true);
  t.ok(res.cn);
  t.equal(res.cn.length, 2);
  t.equal(res.cn[0], 'new');
  t.equal(res.cn[1], 'two');

  t.end();
});


test('apply - add', function (t) {
  var res;
  var single = new Change({
    operation: 'add',
    modification: {
      type: 'cn',
      vals: ['new']
    }
  });

  // plain
  res = Change.apply(single, { cn: ['old'] });
  t.deepEqual(res.cn, ['old', 'new']);

  // multiple
  res = Change.apply(single, { cn: ['old', 'also'] });
  t.deepEqual(res.cn, ['old', 'also', 'new']);

  //absent
  res = Change.apply(single, { dn: ['otherjunk'] });
  t.deepEqual(res.cn, ['new']);

  // scalar formatting "success"
  res = Change.apply(single, { }, true);
  t.equal(res.cn, 'new');

  // scalar formatting "failure"
  res = Change.apply(single, { cn: 'old' }, true);
  t.deepEqual(res.cn, ['old', 'new']);

  // duplicate add
  res = Change.apply(single, { cn: 'new' });
  t.deepEqual(res.cn, ['new']);

  t.end();
});


test('apply - delete', function (t) {
  var res;
  var single = new Change({
    operation: 'delete',
    modification: {
      type: 'cn',
      vals: ['old']
    }
  });

  // plain
  res = Change.apply(single, { cn: ['old', 'new'] });
  t.deepEqual(res.cn, ['new']);

  // empty
  res = Change.apply(single, { cn: ['old'] });
  t.equal(res.cn, undefined);
  t.ok(Object.keys(res).indexOf('cn') === -1);

  // scalar formatting "success"
  res = Change.apply(single, { cn: ['old', 'one'] }, true);
  t.equal(res.cn, 'one');

  // scalar formatting "failure"
  res = Change.apply(single, { cn: ['old', 'several', 'items'] }, true);
  t.deepEqual(res.cn, ['several', 'items']);


  //absent
  res = Change.apply(single, { dn: ['otherjunk'] });
  t.ok(res);
  t.equal(res.cn, undefined);

  t.end();
});
