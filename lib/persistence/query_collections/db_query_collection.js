var QueryCollection = require('./query_collection');
/**
 * A database implementation of the QueryCollection
 * @param entityName the name of the entity to create the collection for
 * @constructor
 */
function DbQueryCollection (session, entityName) {
    this.init(session, entityName, DbQueryCollection);
}
DbQueryCollection.prototype = new QueryCollection();

module.exports = DbQueryCollection;