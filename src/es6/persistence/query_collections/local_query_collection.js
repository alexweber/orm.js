var DbQueryCollection = require('./db_query_collection'),
    QueryCollection = require('./query_collection'),
    argspec = require('../argspec'),
    util = require('../util');

class LocalQueryCollection extends QueryCollection {
    constructor (session, initialArray) {
        super(session);
        this.init(persistence, null, LocalQueryCollection);
        this._items = initialArray || [];
    }

    clone () {
        var c = DbQueryCollection.prototype.clone.call(this);
        c._items = this._items;
        return c;
    }

    add (obj) {
        if(!util.arrayContains(this._items, obj)) {
            this._session.add(obj);
            this._items.push(obj);
            this.triggerEvent('add', this, obj);
            this.triggerEvent('change', this, obj);
        }
    }

    addAll (objs) {
        for(var i = 0; i < objs.length; i++) {
            var obj = objs[i];
            if(!util.arrayContains(this._items, obj)) {
                this._session.add(obj);
                this._items.push(obj);
                this.triggerEvent('add', this, obj);
            }
        }
        this.triggerEvent('change', this);
    }

    remove (obj) {
        var items = this._items;
        for(var i = 0; i < items.length; i++) {
            if(items[i] === obj) {
                this._items.splice(i, 1);
                this.triggerEvent('remove', this, obj);
                this.triggerEvent('change', this, obj);
            }
        }
    }

    list (tx, callback) {
        var args = argspec.getArgs(arguments, [
            { name: 'tx', optional: true, check: persistence.isTransaction, defaultValue: null },
            { name: 'callback', optional: true, check: argspec.isCallback() }
        ]);
        callback = args.callback;

        if(!callback || callback.executeSql) { // first argument is transaction
            callback = arguments[1]; // set to second argument
        }
        var array = this._items.slice(0);
        var that = this;
        var results = [];
        for(var i = 0; i < array.length; i++) {
            if(this._filter.match(array[i])) {
                results.push(array[i]);
            }
        }
        results.sort(function(a, b) {
            for(var i = 0; i < that._orderColumns.length; i++) {
                var col = that._orderColumns[i][0];
                var asc = that._orderColumns[i][1];
                var sens = that._orderColumns[i][2];
                var aVal = persistence.get(a, col);
                var bVal = persistence.get(b, col);
                if (!sens) {
                    aVal = aVal.toLowerCase();
                    bVal = bVal.toLowerCase();
                }
                if(aVal < bVal) {
                    return asc ? -1 : 1;
                } else if(aVal > bVal) {
                    return asc ? 1 : -1;
                }
            }
            return 0;
        });
        if(this._skip) {
            results.splice(0, this._skip);
        }
        if(this._limit > -1) {
            results = results.slice(0, this._limit);
        }
        if(this._reverse) {
            results.reverse();
        }
        if(callback) {
            callback(results);
        } else {
            return results;
        }
    }

    destroyAll (callback) {
        if(!callback || callback.executeSql) { // first argument is transaction
            callback = arguments[1]; // set to second argument
        }
        this._items = [];
        this.triggerEvent('change', this);
        if(callback) callback();
    }

    count (tx, callback) {
        var args = argspec.getArgs(arguments, [
            { name: 'tx', optional: true, check: persistence.isTransaction, defaultValue: null },
            { name: 'callback', optional: true, check: argspec.isCallback() }
        ]);
        tx = args.tx;
        callback = args.callback;

        var result = this.list();

        if(callback) {
            callback(result.length);
        } else {
            return result.length;
        }
    }
}

module.exports = LocalQueryCollection;