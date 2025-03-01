var Backend = require('../lib/backend');
var expect = require('chai').expect;
var sinon = require('sinon');

describe('Backend', function() {
  var backend;
  var agent = {
    custom: {
      foo: 'bar'
    }
  };
  var fetchOptions = {
    snapshotOptions: {
      fizz: 'buzz'
    }
  };

  beforeEach(function() {
    backend = new Backend();
  });

  afterEach(function(done) {
    backend.close(done);
  });

  describe('a simple document', function() {
    beforeEach(function(done) {
      var doc = backend.connect().get('books', '1984');
      doc.create({title: '1984'}, function(error) {
        if (error) return done(error);
        doc.submitOp({p: ['author'], oi: 'George Orwell'}, done);
      });
    });

    describe('getOps', function() {
      it('fetches all the ops', function(done) {
        backend.getOps(agent, 'books', '1984', 0, null, function(error, ops) {
          if (error) return done(error);
          expect(ops).to.have.length(2);
          expect(ops[0].create.data).to.eql({title: '1984'});
          expect(ops[1].op).to.eql([{p: ['author'], oi: 'George Orwell'}]);
          done();
        });
      });

      it('fetches the ops with metadata', function(done) {
        var options = {
          opsOptions: {metadata: true}
        };
        backend.getOps(agent, 'books', '1984', 0, null, options, function(error, ops) {
          if (error) return done(error);
          expect(ops).to.have.length(2);
          expect(ops[0].m).to.be.ok;
          expect(ops[1].m).to.be.ok;
          done();
        });
      });
    });

    describe('fetch', function() {
      it('fetches the document', function(done) {
        backend.fetch(agent, 'books', '1984', function(error, doc) {
          if (error) return done(error);
          expect(doc.data).to.eql({
            title: '1984',
            author: 'George Orwell'
          });
          done();
        });
      });

      it('fetches the document with metadata', function(done) {
        var options = {
          snapshotOptions: {metadata: true}
        };
        backend.fetch(agent, 'books', '1984', options, function(error, doc) {
          if (error) return done(error);
          expect(doc.m).to.be.ok;
          done();
        });
      });

      it('passes agent.custom and snapshot options to db', function(done) {
        var getSnapshotSpy = sinon.spy(backend.db, 'getSnapshot');
        backend.fetch(agent, 'books', '1984', fetchOptions, function(error) {
          if (error) return done(error);
          expect(getSnapshotSpy.args[0][3]).to.deep.equal({
            agentCustom: agent.custom,
            fizz: 'buzz'
          });
          done();
        });
      });
    });

    describe('fetchBulk', function() {
      it('passes agent.custom and snapshot options to db', function(done) {
        var getSnapshotBulkSpy = sinon.spy(backend.db, 'getSnapshotBulk');
        backend.fetchBulk(agent, 'books', ['1984'], fetchOptions, function(error) {
          if (error) return done(error);
          expect(getSnapshotBulkSpy.getCall(0).args[3]).to.deep.equal({
            agentCustom: agent.custom,
            fizz: 'buzz'
          });
          done();
        });
      });
    });

    describe('subscribe', function() {
      it('subscribes to the document', function(done) {
        backend.subscribe(agent, 'books', '1984', null, function(error, stream, snapshot) {
          if (error) return done(error);
          expect(stream.open).to.equal(true);
          expect(snapshot.data).to.eql({
            title: '1984',
            author: 'George Orwell'
          });
          var op = {op: {p: ['publication'], oi: 1949}};
          stream.on('data', function(data) {
            expect(data.op).to.eql(op.op);
            done();
          });
          backend.submit(agent, 'books', '1984', op, null, function(error) {
            if (error) return done(error);
          });
        });
      });

      it('does not support subscribing to the document with options', function(done) {
        var options = {
          opsOptions: {metadata: true}
        };
        backend.subscribe(agent, 'books', '1984', null, options, function(error) {
          expect(error.code).to.equal('ERR_DATABASE_METHOD_NOT_IMPLEMENTED');
          done();
        });
      });
    });

    describe('submitRequestEnd', function() {
      it('emits after write', function(done) {
        var afterWriteCalled = false;

        backend.use(backend.MIDDLEWARE_ACTIONS.afterWrite, function(request, next) {
          afterWriteCalled = true;
          next();
        });

        backend.on('submitRequestEnd', function(error, request) {
          expect(error).not.to.be.ok;
          expect(request).to.be.ok;
          expect(afterWriteCalled).to.be.true;
          done();
        });

        var op = {op: {p: ['publicationYear'], oi: 1949}};
        backend.submit(agent, 'books', '1984', op, null, function(error) {
          if (error) done(error);
        });
      });

      it('emits after an error is raised in the middleware', function(done) {
        backend.use(backend.MIDDLEWARE_ACTIONS.submit, function(request, next) {
          next(new Error());
        });

        backend.on('submitRequestEnd', function(error, request) {
          expect(error).to.be.ok;
          expect(request).to.be.ok;
          done();
        });

        var op = {op: {p: ['publicationYear'], oi: 1949}};
        backend.submit(agent, 'books', '1984', op, null, function() {
          // Swallow the error
        });
      });
    });
  });
});
