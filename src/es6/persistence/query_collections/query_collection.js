var Observable = require('../observable'),
    NullFilter = require('../filters/null_filter'),
    AndFilter = require('../filters/and_filter'),
    PropertyFilter = require('../filters/property_filter'),
    OrFilter = require('../filters/or_filter'),
    argspec = require('../argspec');

/**
 * The constructor function of the _abstract_ QueryCollection
 * DO NOT INSTANTIATE THIS
 * @constructor
 */
class QueryCollection extends Observable {
    constructor (session) {
        this.session = session;
    }

    setupSubscriptions () {
        this._filter.subscribeGlobally(this, this._entityName);
    }

    teardownSubscriptions () {
        this._filter.unsubscribeGlobally(this, this._entityName);
    }

    addEventListener (eventType, fn) {
        var that = this;
        var subscription = this.oldAddEventListener(eventType, fn);
        if(this.subscribers[eventType].length === 1) { // first subscriber
            this.setupSubscriptions();
        }
        subscription.oldUnsubscribe = subscription.unsubscribe;
        subscription.unsubscribe = function() {
            this.oldUnsubscribe();

            if(that.subscribers[eventType].length === 0) { // last subscriber
                that.teardownSubscriptions();
            }
        };
        return subscription;
    }

    /**
     * Function called when session is flushed, returns list of SQL queries to execute
     * (as [query, arg] tuples)
     */
    persistQueries () {
        return [];
    };

    /**
     * Invoked by sub-classes to initialize the query collection
     */
    init (session, entityName, constructor) {
        this._filter = new NullFilter();
        this._orderColumns = []; // tuples of [column, ascending]
        this._prefetchFields = [];
        this._entityName = entityName;
        this._constructor = constructor;
        this._limit = -1;
        this._skip = 0;
        this._reverse = false;
        this._session = session || persistence;
        // For observable
        this.subscribers = {};
    }

    toUniqueString () {
        var s = this._constructor.name + ": " + this._entityName;
        s += '|Filter:';
        var values = [];
        s += this._filter.toUniqueString();
        s += '|Values:';
        for(var i = 0; i < values.length; i++) {
            s += values + "|^|";
        }
        s += '|Order:';
        for(var i = 0; i < this._orderColumns.length; i++) {
            var col = this._orderColumns[i];
            s += col[0] + ", " + col[1] + ", " + col[2];
        }
        s += '|Prefetch:';
        for(var i = 0; i < this._prefetchFields.length; i++) {
            s += this._prefetchFields[i];
        }
        s += '|Limit:';
        s += this._limit;
        s += '|Skip:';
        s += this._skip;
        s += '|Reverse:';
        s += this._reverse;
        return s;
    }

    /**
     * Creates a clone of this query collection
     * @return a clone of the collection
     */
    clone (cloneSubscribers) {
        var c = new (this._constructor)(this._session, this._entityName);
        c._filter = this._filter;
        c._prefetchFields = this._prefetchFields.slice(0); // clone
        c._orderColumns = this._orderColumns.slice(0);
        c._limit = this._limit;
        c._skip = this._skip;
        c._reverse = this._reverse;
        if(cloneSubscribers) {
            var subscribers = {};
            for(var eventType in this.subscribers) {
                if(this.subscribers.hasOwnProperty(eventType)) {
                    subscribers[eventType] = this.subscribers[eventType].slice(0);
                }
            }
            c.subscribers = subscribers; //this.subscribers;
        } else {
            c.subscribers = this.subscribers;
        }
        return c;
    }

    /**
     * Returns a new query collection with a property filter condition added
     * @param property the property to filter on
     * @param operator the operator to use
     * @param value the literal value that the property should match
     * @return the query collection with the filter added
     */
    filter (property, operator, value) {
        var c = this.clone(true);
        c._filter = new AndFilter(this._filter, new PropertyFilter(property,
            operator, value));
        // Add global listener (TODO: memory leak waiting to happen!)
        var session = this._session;
        c = session.uniqueQueryCollection(c);
        //session.subscribeToGlobalPropertyListener(c, this._entityName, property);
        return session.uniqueQueryCollection(c);
    }

    /**
     * Returns a new query collection with an OR condition between the
     * current filter and the filter specified as argument
     * @param filter the other filter
     * @return the new query collection
     */
    or (filter) {
        var c = this.clone(true);
        c._filter = new OrFilter(this._filter, filter);
        return this._session.uniqueQueryCollection(c);
    }

    /**
     * Returns a new query collection with an AND condition between the
     * current filter and the filter specified as argument
     * @param filter the other filter
     * @return the new query collection
     */
    and (filter) {
        var c = this.clone(true);
        c._filter = new AndFilter(this._filter, filter);
        return this._session.uniqueQueryCollection(c);
    }

    /**
     * Returns a new query collection with an ordering imposed on the collection
     * @param property the property to sort on
     * @param ascending should the order be ascending (= true) or descending (= false)
     * @param caseSensitive should the order be case sensitive (= true) or case insensitive (= false)
     *        note: using case insensitive ordering for anything other than TEXT fields yields
     *        undefinded behavior
     * @return the query collection with imposed ordering
     */
    order (property, ascending, caseSensitive) {
        ascending = ascending === undefined ? true : ascending;
        caseSensitive = caseSensitive === undefined ? true : caseSensitive;
        var c = this.clone();
        c._orderColumns.push( [ property, ascending, caseSensitive ]);
        return this._session.uniqueQueryCollection(c);
    }

    /**
     * Returns a new query collection will limit its size to n items
     * @param n the number of items to limit it to
     * @return the limited query collection
     */
    limit (n) {
        var c = this.clone();
        c._limit = n;
        return this._session.uniqueQueryCollection(c);
    }

    /**
     * Returns a new query collection which will skip the first n results
     * @param n the number of results to skip
     * @return the query collection that will skip n items
     */
    skip (n) {
        var c = this.clone();
        c._skip = n;
        return this._session.uniqueQueryCollection(c);
    }

    /**
     * Returns a new query collection which reverse the order of the result set
     * @return the query collection that will reverse its items
     */
    reverse () {
        var c = this.clone();
        c._reverse = true;
        return this._session.uniqueQueryCollection(c);
    }

    /**
     * Returns a new query collection which will prefetch a certain object relationship.
     * Only works with 1:1 and N:1 relations.
     * Relation must target an entity, not a mix-in.
     * @param rel the relation name of the relation to prefetch
     * @return the query collection prefetching `rel`
     */
    prefetch (rel) {
        var c = this.clone();
        c._prefetchFields.push(rel);
        return this._session.uniqueQueryCollection(c);
    }

    /**
     * Select a subset of data, represented by this query collection as a JSON
     * structure (Javascript object)
     *
     * @param tx database transaction to use, leave out to start a new one
     * @param props a property specification
     * @param callback(result)
     */
    selectJSON (tx, props, callback) {
        var args = argspec.getArgs(arguments, [
            { name: "tx", optional: true, check: persistence.isTransaction, defaultValue: null },
            { name: "props", optional: false },
            { name: "callback", optional: false }
        ]);
        var session = this._session;
        var that = this;
        tx = args.tx;
        props = args.props;
        callback = args.callback;

        if(!tx) {
            session.transaction(function(tx) {
                that.selectJSON(tx, props, callback);
            });
            return;
        }
        var Entity = session.getEntity(this._entityName);
        // TODO: This could do some clever prefetching to make it more efficient
        this.list(function(items) {
            var resultArray = [];
            persistence.asyncForEach(items, function(item, callback) {
                item.selectJSON(tx, props, function(obj) {
                    resultArray.push(obj);
                    callback();
                });
            }, function() {
                callback(resultArray);
            });
        });
    };

    /**
     * Adds an object to a collection
     * @param obj the object to add
     */
    add (obj) {
        if(!obj.id || !obj._type) {
            throw new Error("Cannot add object of non-entity type onto collection.");
        }
        this._session.add(obj);
        this._filter.makeFit(obj);
        this.triggerEvent('add', this, obj);
        this.triggerEvent('change', this, obj);
    }

    /**
     * Adds an an array of objects to a collection
     * @param obj the object to add
     */
    addAll (objs) {
        for(var i = 0; i < objs.length; i++) {
            var obj = objs[i];
            this._session.add(obj);
            this._filter.makeFit(obj);
            this.triggerEvent('add', this, obj);
        }
        this.triggerEvent('change', this);
    }

    /**
     * Removes an object from a collection
     * @param obj the object to remove from the collection
     */
    remove (obj) {
        if(!obj.id || !obj._type) {
            throw new Error("Cannot remove object of non-entity type from collection.");
        }
        this._filter.makeNotFit(obj);
        this.triggerEvent('remove', this, obj);
        this.triggerEvent('change', this, obj);
    }

    /**
     * Execute a function for each item in the list
     * @param tx the transaction to use (or null to open a new one)
     * @param eachFn (elem) the function to be executed for each item
     */
    each (tx, eachFn) {
        var args = argspec.getArgs(arguments, [
            { name: 'tx', optional: true, check: persistence.isTransaction, defaultValue: null },
            { name: 'eachFn', optional: true, check: argspec.isCallback() }
        ]);
        tx = args.tx;
        eachFn = args.eachFn;

        this.list(tx, function(results) {
            for(var i = 0; i < results.length; i++) {
                eachFn(results[i]);
            }
        });
    }

    one (tx, oneFn) {
        var args = argspec.getArgs(arguments, [
            { name: 'tx', optional: true, check: persistence.isTransaction, defaultValue: null },
            { name: 'oneFn', optional: false, check: argspec.isCallback() }
        ]);
        tx = args.tx;
        oneFn = args.oneFn;

        var that = this;
        this.limit(1).list(tx, function(results) {
            if(results.length === 0) {
                oneFn(null);
            } else {
                oneFn(results[0]);
            }
        });
    }
}
// Method Aliases
QueryCollection.prototype.forEach = QueryCollection.prototype.each;
QueryCollection.prototype.oldAddEventListener = QueryCollection.prototype.addEventListener;

module.exports = QueryCollection;