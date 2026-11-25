const { TestEnvironment } = require('jest-environment-node');

// O driver usa a serialização do Node fora do contexto isolado do Jest.
module.exports = class MongoEnvironment extends TestEnvironment {
  async setup() {
    await super.setup();
    this.global.mongoDriver = require('mongodb');
  }
};
