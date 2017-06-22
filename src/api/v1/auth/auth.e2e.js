/* eslint func-names: 0 */
/* eslint no-unused-expressions: 0 */
'use strict';
const chai = require('chai');
const chaiHttp = require('chai-http');
const { anonAgent, url } = require('../../../../test/e2e');

const { expect } = chai;
chai.use(chaiHttp);

// These tests suck (no yields) because https://github.com/chaijs/chai-http/issues/75
// needs to be implemented
describe('/login', () => {
  describe('POST', () => {
    it('Bad credentials -> 401', (done) => {
      chai.request(url).post('/login')
        .send({
          email: 'foo@bar.com',
          password: 'baz'
        })
        .end((err, res) => {
          expect(res).to.have.status(401);
          done();
        });
    });

    it('Not an email -> 400', (done) => {
      chai.request(url).post('/login')
        .send({
          email: 'foo',
          password: 'baz'
        })
        .end((err, res) => {
          expect(res).to.have.status(400);
          done();
        });
    });

    it('Empty password -> 400', (done) => {
      chai.request(url).post('/login')
        .send({
          email: 'foo@bar.com',
          password: ''
        })
        .end((err, res) => {
          expect(res).to.have.status(400);
          done();
        });
    });

    describe('Good credentials', () => {
      let res;
      before('logs in', function* () {
        res = yield chai.request(url).post('/login').send({
          email: 'twigtest@corp.riglet.io',
          password: '978f9YYX2n&b',
        });
      });

      it('returns 200', () => {
        expect(res).to.have.status(200);
      });

      it.only('sets a cookie', () => {
        // TODO: waiting for a chai-http release that includes https://github.com/chaijs/chai-http/issues/43
        // expect(res).to.have.cookie('sid');
        expect(res).to.have.header('set-cookie', /^sid=/);
      });

      it('returns response', () => {
        expect(res.body).to.deep.eq({
          user: {
            id: 'twigtest@corp.riglet.io',
            name: 'twigtest@corp.riglet.io'
          }
        });
      });
    });
  });
});

describe('/logout', () => {
  describe('POST', () => {
    let response;
    describe('Authenticated agent', () => {
      before(function* () {
        // arrange
        const agent = chai.request.agent(url);
        yield agent.post('/login')
          .send({
            email: 'twigtest@corp.riglet.io',
            password: '978f9YYX2n&b',
          });

        // act
        response = yield agent.post('/logout');
      });

      it('returns 204', () => {
        expect(response).to.have.status(204);
      });

      it('clears cookie', () => {
        expect(response).to.not.have.cookie('sid');
      });
    });

    describe('Unauthenticated agent', () => {
      before(function* () {
        response = yield anonAgent.post('/logout');
      });

      it('returns 204', () => {
        expect(response).to.have.status(204);
      });

      it('clears cookie', () => {
        expect(response).to.not.have.cookie('sid');
      });
    });
  });
});
