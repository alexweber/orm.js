var DbQueryCollection = require('./db_query_collection'),
    util = require('../util');

/**
 * A ManyToMany implementation of QueryCollection
 * @constructor
 */
function ManyToManyDbQueryCollection (session, entityName) {
    this.init(session, entityName, persistence.ManyToManyDbQueryCollection);
    this._localAdded = [];
    this._localRemoved = [];
}

ManyToManyDbQueryCollection.prototype = new DbQueryCollection();

ManyToManyDbQueryCollection.prototype.initManyToMany = function(obj, coll) {
    this._obj = obj;
    this._coll = coll;
};

ManyToManyDbQueryCollection.prototype.add = function(obj) {
    if(!util.arrayContains(this._localAdded, obj)) {
        this._session.add(obj);
        this._localAdded.push(obj);
        this.triggerEvent('add', this, obj);
        this.triggerEvent('change', this, obj);
    }
};

ManyToManyDbQueryCollection.prototype.addAll = function(objs) {
    for(var i = 0; i < objs.length; i++) {
        var obj = objs[i];
        if(!util.arrayContains(this._localAdded, obj)) {
            this._session.add(obj);
            this._localAdded.push(obj);
            this.triggerEvent('add', this, obj);
        }
    }
    this.triggerEvent('change', this);
}

ManyToManyDbQueryCollection.prototype.clone = function() {
    var c = DbQueryCollection.prototype.clone.call(this);
    c._localAdded = this._localAdded;
    c._localRemoved = this._localRemoved;
    c._obj = this._obj;
    c._coll = this._coll;
    return c;
};

ManyToManyDbQueryCollection.prototype.remove = function(obj) {
    if(util.arrayContains(this._localAdded, obj)) { // added locally, can just remove it from there
        util.arrayRemove(this._localAdded, obj);
    } else if(!util.arrayContains(this._localRemoved, obj)) {
        this._localRemoved.push(obj);
    }
    this.triggerEvent('remove', this, obj);
    this.triggerEvent('change', this, obj);
};

module.exports = ManyToManyDbQueryCollection;