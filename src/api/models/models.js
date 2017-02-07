'use strict';
const Boom = require('boom');
const Joi = require('joi');
const PouchDB = require('pouchdb');
const config = require('../../config');
const logger = require('../../log')('MODELS');

const createModelRequest = Joi.object({
  commitMessage: Joi.string().required(),
  entities: Joi.object().pattern(/[\S\s]*/, Joi.object({
    class: Joi.string().required(),
    color: Joi.string(),
    image: Joi.string().required(),
    size: [Joi.string().allow('').allow(null), Joi.number()],
    type: Joi.string(),
  })),
  name: Joi.string().required(),
});

const updateModelRequest = createModelRequest.keys({
  _rev: Joi.string().required(),
});

const getModelResponse = updateModelRequest.keys({
  url: Joi.string().uri().required(),
  changelog_url: Joi.string().uri().required(),
  commitMessage: Joi.invalid(),
});

const getModelsResponse = Joi.array().items(Joi.object({
  name: Joi.string().required(),
  url: Joi.string().required(),
}));

const getModel = (name) => {
  const db = new PouchDB(config.getTenantDatabaseString('organisation-models'));
  return db.allDocs({ include_docs: true })
  .then(modelsRaw => {
    const modelArray = modelsRaw.rows.filter(row => row.doc.data.name === name);
    if (modelArray.length) {
      return modelArray[0].doc;
    }
    const error = Error('Not Found');
    error.status = 404;
    throw error;
  });
};

const postModelsHandler = (request, reply) => {
  const db = new PouchDB(config.getTenantDatabaseString('organisation-models'));
  return getModel(request.payload.name)
  .catch(error => {
    if (error.status === 404) {
      return db.post({
        data: {
          entities: request.payload.entities,
          changelog: [{
            message: request.payload.commitMessage,
            user: request.auth.credentials.user.name,
            timestamp: new Date().toISOString(),
          }],
          name: request.payload.name,
        }
      })
      .then(() => getModel(request.payload.name))
      .then(newModel => {
        const modelResponse = {
          entities: newModel.data.entities,
          _rev: newModel._rev,
          name: newModel.data.name,
          url: request.buildUrl(`/models/${newModel.data.name}`),
          changelog_url: request.buildUrl(`/models/${newModel.data.name}/changelog`)
        };
        reply(modelResponse).code(201);
      });
    }
    throw error;
  })
  .catch(e => {
    logger.error(JSON.stringify(e));
    return reply(Boom.create(e.status || 500, e.message, e));
  });
};

const getModelsHandler = (request, reply) => {
  const db = new PouchDB(config.getTenantDatabaseString('organisation-models'));
  return db.allDocs({ include_docs: true })
    .then(modelsRaw => {
      const orgModels = modelsRaw.rows.reduce((array, row) => {
        const object = {
          name: row.doc.data.name,
          url: request.buildUrl(`/models/${row.doc.data.name}`),
        };
        array.push(object);
        return array;
      }, []);
      return reply(orgModels);
    })
    .catch((error) => {
      logger.error(JSON.stringify(error));
      return reply(Boom.create(error.status || 500, error.message, error));
    });
};

const getModelHandler = (request, reply) => {
  getModel(request.params.name)
    .then(model => {
      const modelResponse = {
        entities: model.data.entities,
        name: model.data.name,
        _rev: model._rev,
        url: request.buildUrl(`/models/${model.data.name}`),
        changelog_url: request.buildUrl(`/models/${model.data.name}/changelog`)
      };
      return reply(modelResponse);
    })
    .catch((error) => {
      logger.error(JSON.stringify(error));
      return reply(Boom.create(error.status || 500, error.message, error));
    });
};

const putModelHandler = (request, reply) => {
  const db = new PouchDB(config.getTenantDatabaseString('organisation-models'));
  getModel(request.params.name)
    .then(model => {
      if (model._rev === request.payload._rev) {
        model.data.entities = request.payload.entities;
        model.data.name = request.payload.name;
        model.data.changelog.unshift({
          message: request.payload.commitMessage,
          user: request.auth.credentials.user.name,
          timestamp: new Date().toISOString(),
        });
        return db.put(model);
      }
      const error = Error('Conflict, bad revision number');
      error.status = 409;
      error._rev = model._rev;
      throw error;
    })
    .then(() => getModel(request.payload.name))
    .then(model => {
      const modelResponse = {
        name: model.data.name,
        _rev: model._rev,
        entities: model.data.entities,
        url: request.buildUrl(`/models/${model.data.name}`),
        changelog_url: request.buildUrl(`/models/${model.data.name}/changelog`)
      };
      return reply(modelResponse).code(200);
    })
    .catch((error) => {
      logger.error(JSON.stringify(error));
      const boomError = Boom.create(error.status || 500, error.message);
      if (error._rev) {
        boomError.output.payload._rev = error._rev;
      }
      return reply(boomError);
    });
};

const deleteModelsHandler = (request, reply) => {
  const db = new PouchDB(config.getTenantDatabaseString('organisation-models'));
  return getModel(request.params.name)
  .then(model => db.remove(model._id, model._rev).then(() => reply().code(204)))
  .catch(error => {
    logger.error(JSON.stringify(error));
    return reply(Boom.create(error.status || 500, error.message, error));
  });
};

const routes = [
  {
    method: ['POST'],
    path: '/models',
    handler: postModelsHandler,
    config: {
      validate: {
        payload: createModelRequest
      },
      response: { schema: getModelResponse },
      tags: ['api'],
    }
  },
  {
    method: ['GET'],
    path: '/models',
    handler: getModelsHandler,
    config: {
      auth: { mode: 'optional' },
      response: { schema: getModelsResponse },
      tags: ['api'],
    }
  },
  {
    method: ['GET'],
    path: '/models/{name}',
    handler: getModelHandler,
    config: {
      auth: { mode: 'optional' },
      response: { schema: getModelResponse },
      tags: ['api'],
    }
  },
  {
    method: ['PUT'],
    path: '/models/{name}',
    handler: putModelHandler,
    config: {
      validate: {
        payload: updateModelRequest
      },
      response: { schema: getModelResponse },
      tags: ['api'],
    }
  },
  {
    method: ['DELETE'],
    path: '/models/{name}',
    handler: deleteModelsHandler,
    config: {
      tags: ['api'],
    }
  },
];

module.exports = {
  getModel,
  getModelResponse,
  updateModelRequest,
  routes,
};
