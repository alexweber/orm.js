exports.init = function(persistence, config) {
  var persistenceStore;
  switch (config.adaptor) {
    case 'memory':
      persistenceStore = require('./persistence.store.memory.js');
      break;
    case 'mysql':
      persistenceStore = require('./persistence.store.mysql.js');
      break;
    case 'sqlite3':
      persistenceStore = require('./persistence.store.sqlite3.js');
      break;
    default:
      persistenceStore = require('./persistence.store.mysql.js');
      break;
  }

  if (config.username) config.user = config.username;
  if (config.hostname) config.host = config.hostname;
  persistenceStore.config(persistence,
                          config.host,
                          config.port,
                          config.database,
                          config.user,
                          config.password);
  return persistenceStore;
};
