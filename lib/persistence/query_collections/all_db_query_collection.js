var DbQueryCollection = require('./db_query_collection');

/**
 * An implementation of QueryCollection, that is used
 * to represent all instances of an entity type
 * @constructor
 */
function AllDbQueryCollection (session, entityName) {
    this.init(session, entityName, AllDbQueryCollection);
}

AllDbQueryCollection.prototype = new DbQueryCollection();

AllDbQueryCollection.prototype.add = function(obj) {
    this._session.add(obj);
    this.triggerEvent('add', this, obj);
    this.triggerEvent('change', this, obj);
};

AllDbQueryCollection.prototype.remove = function(obj) {
    this._session.remove(obj);
    this.triggerEvent('remove', this, obj);
    this.triggerEvent('change', this, obj);
};

module.exports = AllDbQueryCollection;