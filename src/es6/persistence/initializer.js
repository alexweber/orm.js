var argspec = require('./argspec')
    Subscription = require('./subscription'),
    Observable = require('./observable'),
    EntityTypeFactory = require('./entity_type_factory');

// Filters
var NullFilter = require('./filters/null_filter'),
    AndFilter = require('./filters/and_filter'),
    OrFilter = require('./filters/or_filter'),
    PropertyFilter = require('./filters/property_filter');

// Query Collections
var QueryCollection = require('./query_collections/query_collection'),
    DbQueryCollection = require('./query_collections/db_query_collection'),
    AllDbQueryCollection = require('./query_collections/all_db_query_collection'),
    ManyToManyDbQueryCollection = require('./query_collections/many_to_many_query_collection'),
    LocalQueryCollection = require('./query_collections/local_query_collection');

module.exports = {
    initialize: function(persistence) {
        if (persistence.isImmutable) // already initialized
            return persistence;

        /**
         * Check for immutable fields
         */
        persistence.isImmutable = function(fieldName) {
            return (fieldName == "id");
        };

        persistence.argspec = argspec;
        persistence.NullFilter                  = NullFilter;
        persistence.AndFilter                   = AndFilter;
        persistence.OrFilter                    = OrFilter;
        persistence.PropertyFilter              = PropertyFilter;
        persistence.QueryCollection             = QueryCollection;
        persistence.DbQueryCollection           = DbQueryCollection;
        persistence.AllDbQueryCollection        = AllDbQueryCollection;
        persistence.ManyToManyDbQueryCollection = ManyToManyDbQueryCollection;
        persistence.LocalQueryCollection        = LocalQueryCollection;
        persistence.Observable                  = Observable;
        persistence.Subscription                = Subscription;
        persistence.AndFilter                   = AndFilter;
        persistence.OrFilter                    = OrFilter;
        persistence.PropertyFilter              = PropertyFilter;

        /**
         * Default implementation for entity-property
         */
        persistence.defineProp = function(scope, field, setterCallback, getterCallback) {
            if (typeof (scope.__defineSetter__) === 'function' && typeof (scope.__defineGetter__) === 'function') {
                scope.__defineSetter__(field, function (value) {
                    setterCallback(value);
                });
                scope.__defineGetter__(field, function () {
                    return getterCallback();
                });
            } else {
                Object.defineProperty(scope, field, {
                    get: getterCallback,
                    set: function (value) {
                        setterCallback(value);
                    },
                    enumerable: true, configurable: true
                });
            }
        };

        /**
         * Default implementation for entity-property setter
         */
        persistence.set = function(scope, fieldName, value) {
            if (persistence.isImmutable(fieldName)) throw new Error("immutable field: "+fieldName);
            scope[fieldName] = value;
        };

        /**
         * Default implementation for entity-property getter
         */
        persistence.get = function(arg1, arg2) {
            return (arguments.length == 1) ? arg1 : arg1[arg2];
        };

        var entityMeta = {};
        var entityClassCache = {};
        persistence.getEntityMeta = function() { return entityMeta; }

        // Per-session data
        persistence.trackedObjects = {};
        persistence.objectsToRemove = {};
        persistence.objectsRemoved = []; // {id: ..., type: ...}
        persistence.globalPropertyListeners = {}; // EntityType__prop -> QueryColleciton obj
        persistence.queryCollectionCache = {}; // entityName -> uniqueString -> QueryCollection

        persistence.getObjectsToRemove = function() { return this.objectsToRemove; };
        persistence.getTrackedObjects = function() { return this.trackedObjects; };

        // Public Extension hooks
        persistence.entityDecoratorHooks = [];
        persistence.flushHooks = [];
        persistence.schemaSyncHooks = [];

        // Enable debugging (display queries using console.log etc)
        persistence.debug = true;

        persistence.subscribeToGlobalPropertyListener = function(coll, entityName, property) {
            var key = entityName + '__' + property;
            if(key in this.globalPropertyListeners) {
                var listeners = this.globalPropertyListeners[key];
                for(var i = 0; i < listeners.length; i++) {
                    if(listeners[i] === coll) {
                        return;
                    }
                }
                this.globalPropertyListeners[key].push(coll);
            } else {
                this.globalPropertyListeners[key] = [coll];
            }
        };

        persistence.unsubscribeFromGlobalPropertyListener = function(coll, entityName, property) {
            var key = entityName + '__' + property;
            var listeners = this.globalPropertyListeners[key];
            for(var i = 0; i < listeners.length; i++) {
                if(listeners[i] === coll) {
                    listeners.splice(i, 1);
                    return;
                }
            }
        };

        persistence.propertyChanged = function(obj, property, oldValue, newValue) {
            if(!this.trackedObjects[obj.id]) return; // not yet added, ignore for now

            var entityName = obj._type;
            var key = entityName + '__' + property;
            if(key in this.globalPropertyListeners) {
                var listeners = this.globalPropertyListeners[key];
                for(var i = 0; i < listeners.length; i++) {
                    var coll = listeners[i];
                    var dummyObj = obj._data;
                    dummyObj[property] = oldValue;
                    var matchedBefore = coll._filter.match(dummyObj);
                    dummyObj[property] = newValue;
                    var matchedAfter = coll._filter.match(dummyObj);
                    if(matchedBefore != matchedAfter) {
                        coll.triggerEvent('change', coll, obj);
                    }
                }
            }
        }

        persistence.objectRemoved = function(obj) {
            var entityName = obj._type;
            if(this.queryCollectionCache[entityName]) {
                var colls = this.queryCollectionCache[entityName];
                for(var key in colls) {
                    if(colls.hasOwnProperty(key)) {
                        var coll = colls[key];
                        if(coll._filter.match(obj)) { // matched the filter -> was part of collection
                            coll.triggerEvent('change', coll, obj);
                        }
                    }
                }
            }
        }

        /**
         * Retrieves metadata about entity, mostly for internal use
         */
        function getMeta(entityName) {
            return entityMeta[entityName];
        }

        persistence.getMeta = getMeta;


        /**
         * A database session
         */
        function Session(conn) {
            this.trackedObjects = {};
            this.objectsToRemove = {};
            this.objectsRemoved = [];
            this.globalPropertyListeners = {}; // EntityType__prop -> QueryColleciton obj
            this.queryCollectionCache = {}; // entityName -> uniqueString -> QueryCollection
            this.conn = conn;
        }

        Session.prototype = persistence; // Inherit everything from the root persistence object

        persistence.Session = Session;

        /**
         * Define an entity
         *
         * @param entityName
         *            the name of the entity (also the table name in the database)
         * @param fields
         *            an object with property names as keys and SQLite types as
         *            values, e.g. {name: "TEXT", age: "INT"}
         * @return the entity's constructor
         */
        persistence.define = function (entityName, fields) {
            if (entityMeta[entityName]) { // Already defined, ignore
                return persistence.getEntity(entityName);
            }
            var meta = {
                name: entityName,
                fields: fields,
                isMixin: false,
                indexes: [],
                hasMany: {},
                hasOne: {}
            };
            entityMeta[entityName] = meta;
            return persistence.getEntity(entityName);
        };

        /**
         * Checks whether an entity exists
         *
         * @param entityName
         *            the name of the entity (also the table name in the database)
         * @return `true` if the entity exists, otherwise `false`
         */
        persistence.isDefined = function (entityName) {
            return !!entityMeta[entityName];
        }

        /**
         * Define a mixin
         *
         * @param mixinName
         *            the name of the mixin
         * @param fields
         *            an object with property names as keys and SQLite types as
         *            values, e.g. {name: "TEXT", age: "INT"}
         * @return the entity's constructor
         */
        persistence.defineMixin = function (mixinName, fields) {
            var Entity = this.define(mixinName, fields);
            Entity.meta.isMixin = true;
            return Entity;
        };

        persistence.isTransaction = function(obj) {
            return !obj || (obj && obj.executeSql);
        };

        persistence.isSession = function(obj) {
            return !obj || (obj && obj.schemaSync);
        };

        /**
         * Adds the object to tracked entities to be persisted
         *
         * @param obj
         *            the object to be tracked
         */
        persistence.add = function (obj) {
            if(!obj) return;
            if (!this.trackedObjects[obj.id]) {
                this.trackedObjects[obj.id] = obj;
                if(obj._new) {
                    for(var p in obj._data) {
                        if(obj._data.hasOwnProperty(p)) {
                            this.propertyChanged(obj, p, undefined, obj._data[p]);
                        }
                    }
                }
            }
            return this;
        };

        /**
         * Marks the object to be removed (on next flush)
         * @param obj object to be removed
         */
        persistence.remove = function(obj) {
            if (obj._new) {
                delete this.trackedObjects[obj.id];
            } else {
                if (!this.objectsToRemove[obj.id]) {
                    this.objectsToRemove[obj.id] = obj;
                }
                this.objectsRemoved.push({id: obj.id, entity: obj._type});
            }
            this.objectRemoved(obj);
            return this;
        };


        /**
         * Clean the persistence context of cached entities and such.
         */
        persistence.clean = function () {
            this.trackedObjects = {};
            this.objectsToRemove = {};
            this.objectsRemoved = [];
            this.globalPropertyListeners = {};
            this.queryCollectionCache = {};
        };

        /**
         * asynchronous sequential version of Array.prototype.forEach
         * @param array the array to iterate over
         * @param fn the function to apply to each item in the array, function
         *        has two argument, the first is the item value, the second a
         *        callback function
         * @param callback the function to call when the forEach has ended
         */
        persistence.asyncForEach = function(array, fn, callback) {
            array = array.slice(0); // Just to be sure
            function processOne() {
                var item = array.pop();
                fn(item, function(result, err) {
                    if(array.length > 0) {
                        processOne();
                    } else {
                        callback(result, err);
                    }
                });
            }
            if(array.length > 0) {
                processOne();
            } else {
                callback();
            }
        };

        /**
         * asynchronous parallel version of Array.prototype.forEach
         * @param array the array to iterate over
         * @param fn the function to apply to each item in the array, function
         *        has two argument, the first is the item value, the second a
         *        callback function
         * @param callback the function to call when the forEach has ended
         */
        persistence.asyncParForEach = function(array, fn, callback) {
            var completed = 0;
            var arLength = array.length;
            if(arLength === 0) {
                callback();
            }
            for(var i = 0; i < arLength; i++) {
                fn(array[i], function(result, err) {
                    completed++;
                    if(completed === arLength) {
                        callback(result, err);
                    }
                });
            }
        };

        /**
         * Retrieves or creates an entity constructor function for a given
         * entity name
         * @return the entity constructor function to be invoked with `new fn()`
         */
        persistence.getEntity = function(entityName) {
            if (entityClassCache[entityName]) {
                return entityClassCache[entityName];
            }
            var meta = entityMeta[entityName];
            var entityType = EntityTypeFactory.defineEntity(entityName, meta);


            // Allow decorator functions to add more stuff
            var fns = persistence.entityDecoratorHooks;
            for(var i = 0; i < fns.length; i++) {
                fns[i](Entity);
            }

            entityClassCache[entityName] = entityType;
            return entityType;
        }

        persistence.jsonToEntityVal = function(value, type) {
            if(type) {
                switch(type) {
                    case 'DATE':
                        if(typeof value === 'number') {
                            if (value > 1000000000000) {
                                // it's in milliseconds
                                return new Date(value);
                            } else {
                                return new Date(value * 1000);
                            }
                        } else {
                            return null;
                        }
                        break;
                    default:
                        return value;
                }
            } else {
                return value;
            }
        };

        persistence.entityValToJson = function(value, type) {
            if(type) {
                switch(type) {
                    case 'DATE':
                        if(value) {
                            value = new Date(value);
                            return Math.round(value.getTime() / 1000);
                        } else {
                            return null;
                        }
                        break;
                    default:
                        return value;
                }
            } else {
                return value;
            }
        };

        /**
         * Dumps the entire database into an object (that can be serialized to JSON for instance)
         * @param tx transaction to use, use `null` to start a new one
         * @param entities a list of entity constructor functions to serialize, use `null` for all
         * @param callback (object) the callback function called with the results.
         */
        persistence.dump = function(tx, entities, callback) {
            var args = argspec.getArgs(arguments, [
                { name: 'tx', optional: true, check: persistence.isTransaction, defaultValue: null },
                { name: 'entities', optional: true, check: function(obj) { return !obj || (obj && obj.length && !obj.apply); }, defaultValue: null },
                { name: 'callback', optional: false, check: argspec.isCallback(), defaultValue: function(){} }
            ]);
            tx = args.tx;
            entities = args.entities;
            callback = args.callback;

            if(!entities) { // Default: all entity types
                entities = [];
                for(var e in entityClassCache) {
                    if(entityClassCache.hasOwnProperty(e)) {
                        entities.push(entityClassCache[e]);
                    }
                }
            }

            var result = {};
            persistence.asyncParForEach(entities, function(Entity, callback) {
                Entity.all().list(tx, function(all) {
                    var items = [];
                    persistence.asyncParForEach(all, function(e, callback) {
                        var rec = {};
                        var fields = Entity.meta.fields;
                        for(var f in fields) {
                            if(fields.hasOwnProperty(f)) {
                                rec[f] = persistence.entityValToJson(e._data[f], fields[f]);
                            }
                        }
                        var refs = Entity.meta.hasOne;
                        for(var r in refs) {
                            if(refs.hasOwnProperty(r)) {
                                rec[r] = e._data[r];
                            }
                        }
                        var colls = Entity.meta.hasMany;
                        var collArray = [];
                        for(var coll in colls) {
                            if(colls.hasOwnProperty(coll)) {
                                collArray.push(coll);
                            }
                        }
                        persistence.asyncParForEach(collArray, function(collP, callback) {
                            var coll = persistence.get(e, collP);
                            coll.list(tx, function(results) {
                                rec[collP] = results.map(function(r) { return r.id; });
                                callback();
                            });
                        }, function() {
                            rec.id = e.id;
                            items.push(rec);
                            callback();
                        });
                    }, function() {
                        result[Entity.meta.name] = items;
                        callback();
                    });
                });
            }, function() {
                callback(result);
            });
        };

        /**
         * Loads a set of entities from a dump object
         * @param tx transaction to use, use `null` to start a new one
         * @param dump the dump object
         * @param callback the callback function called when done.
         */
        persistence.load = function(tx, dump, callback) {
            var args = argspec.getArgs(arguments, [
                { name: 'tx', optional: true, check: persistence.isTransaction, defaultValue: null },
                { name: 'dump', optional: false },
                { name: 'callback', optional: true, check: argspec.isCallback(), defaultValue: function(){} }
            ]);
            tx = args.tx;
            dump = args.dump;
            callback = args.callback;

            var finishedCount = 0;
            var collItemsToAdd = [];
            var session = this;
            for(var entityName in dump) {
                if(dump.hasOwnProperty(entityName)) {
                    var Entity = persistence.getEntity(entityName);
                    var fields = Entity.meta.fields;
                    var instances = dump[entityName];
                    for(var i = 0; i < instances.length; i++) {
                        var instance = instances[i];
                        var ent = new Entity();
                        ent.id = instance.id;
                        for(var p in instance) {
                            if(instance.hasOwnProperty(p)) {
                                if (persistence.isImmutable(p)) {
                                    ent[p] = instance[p];
                                } else if(Entity.meta.hasMany[p]) { // collection
                                    var many = Entity.meta.hasMany[p];
                                    if(many.manyToMany && Entity.meta.name < many.type.meta.name) { // Arbitrary way to avoid double adding
                                        continue;
                                    }
                                    var coll = persistence.get(ent, p);
                                    if(instance[p].length > 0) {
                                        instance[p].forEach(function(it) {
                                            collItemsToAdd.push({Entity: Entity, coll: coll, id: it});
                                        });
                                    }
                                } else {
                                    persistence.set(ent, p, persistence.jsonToEntityVal(instance[p], fields[p]));
                                }
                            }
                        }
                        this.add(ent);
                    }
                }
            }
            session.flush(tx, function() {
                persistence.asyncForEach(collItemsToAdd, function(collItem, callback) {
                    collItem.Entity.load(session, tx, collItem.id, function(obj) {
                        collItem.coll.add(obj);
                        callback();
                    });
                }, function() {
                    session.flush(tx, callback);
                });
            });
        };

        /**
         * Dumps the entire database to a JSON string
         * @param tx transaction to use, use `null` to start a new one
         * @param entities a list of entity constructor functions to serialize, use `null` for all
         * @param callback (jsonDump) the callback function called with the results.
         */
        persistence.dumpToJson = function(tx, entities, callback) {
            var args = argspec.getArgs(arguments, [
                { name: 'tx', optional: true, check: persistence.isTransaction, defaultValue: null },
                { name: 'entities', optional: true, check: function(obj) { return obj && obj.length && !obj.apply; }, defaultValue: null },
                { name: 'callback', optional: false, check: argspec.isCallback(), defaultValue: function(){} }
            ]);
            tx = args.tx;
            entities = args.entities;
            callback = args.callback;
            this.dump(tx, entities, function(obj) {
                callback(JSON.stringify(obj));
            });
        };

        /**
         * Loads data from a JSON string (as dumped by `dumpToJson`)
         * @param tx transaction to use, use `null` to start a new one
         * @param jsonDump JSON string
         * @param callback the callback function called when done.
         */
        persistence.loadFromJson = function(tx, jsonDump, callback) {
            var args = argspec.getArgs(arguments, [
                { name: 'tx', optional: true, check: persistence.isTransaction, defaultValue: null },
                { name: 'jsonDump', optional: false },
                { name: 'callback', optional: true, check: argspec.isCallback(), defaultValue: function(){} }
            ]);
            tx = args.tx;
            jsonDump = args.jsonDump;
            callback = args.callback;
            this.load(tx, JSON.parse(jsonDump), callback);
        };


        /**
         * Generates a UUID according to http://www.ietf.org/rfc/rfc4122.txt
         */
        function createUUID () {
            if(persistence.typeMapper && persistence.typeMapper.newUuid) {
                return persistence.typeMapper.newUuid();
            }
            var s = [];
            var hexDigits = "0123456789ABCDEF";
            for ( var i = 0; i < 32; i++) {
                s[i] = hexDigits.substr(Math.floor(Math.random() * 0x10), 1);
            }
            s[12] = "4";
            s[16] = hexDigits.substr((s[16] & 0x3) | 0x8, 1);

            var uuid = s.join("");
            return uuid;
        }

        persistence.createUUID = createUUID;


        function defaultValue(type) {
            if(persistence.typeMapper && persistence.typeMapper.defaultValue) {
                return persistence.typeMapper.defaultValue(type);
            }
            switch(type) {
                case "TEXT": return "";
                case "BOOL": return false;
                default:
                    if(type.indexOf("INT") !== -1) {
                        return 0;
                    } else if(type.indexOf("CHAR") !== -1) {
                        return "";
                    } else {
                        return null;
                    }
            }
        }

        /**
         * Ensure global uniqueness of query collection object
         */
        persistence.uniqueQueryCollection = function(coll) {
            var entityName = coll._entityName;
            if(coll._items) { // LocalQueryCollection
                return coll;
            }
            if(!this.queryCollectionCache[entityName]) {
                this.queryCollectionCache[entityName] = {};
            }
            var uniqueString = coll.toUniqueString();
            if(!this.queryCollectionCache[entityName][uniqueString]) {
                this.queryCollectionCache[entityName][uniqueString] = coll;
            }
            return this.queryCollectionCache[entityName][uniqueString];
        };

        return persistence;
    }
}