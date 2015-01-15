var DbQueryCollection = require('./db_query_collection');

/**
 * An implementation of QueryCollection, that is used
 * to represent all instances of an entity type
 * @constructor
 */
class AllDbQueryCollection extends DbQueryCollection {
    constructor (session, entityName) {
        super(session, entityName);
        this.init(session, entityName, AllDbQueryCollection);
    }

    add (obj) {
        this._session.add(obj);
        this.triggerEvent('add', this, obj);
        this.triggerEvent('change', this, obj);
    }

    remove (obj) {
        this._session.remove(obj);
        this.triggerEvent('remove', this, obj);
        this.triggerEvent('change', this, obj);
    }
}

module.exports = AllDbQueryCollection;