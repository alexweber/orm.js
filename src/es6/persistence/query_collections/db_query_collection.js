var QueryCollection = require('./query_collection');
/**
 * A database implementation of the QueryCollection
 * @param entityName the name of the entity to create the collection for
 * @constructor
 */
class DbQueryCollection extends QueryCollection {
    constructor (session, entityName) {
        super(session);
        this.init(session, entityName, DbQueryCollection);
    }
}

module.exports = DbQueryCollection;