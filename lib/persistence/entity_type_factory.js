var argspec = require('./argspec'),
    AllDbQueryCollection = require('./query_collections/all_db_query_collection');

module.exports = {
    defineEntity: function (entityName, meta) {
        /**
         * @constructor
         */
        function Entity (session, obj, noEvents) {
            var args = argspec.getArgs(arguments, [
                { name: "session", optional: true, check: persistence.isSession, defaultValue: persistence },
                { name: "obj", optional: true, check: function(obj) { return obj; }, defaultValue: {} }
            ]);
            if (meta.isMixin)
                throw new Error("Cannot instantiate mixin");
            session = args.session;
            obj = args.obj;

            var that = this;
            this.id = obj.id || persistence.createUUID();
            this._new = true;
            this._type = entityName;
            this._dirtyProperties = {};
            this._data = {};
            this._data_obj = {}; // references to objects
            this._session = session || persistence;
            this.subscribers = {}; // observable

            for ( var field in meta.fields) {
                (function () {
                    if (meta.fields.hasOwnProperty(field)) {
                        var f = field; // Javascript scopes/closures SUCK
                        persistence.defineProp(that, f, function(val) {
                            // setterCallback
                            var oldValue = that._data[f];
                            if(oldValue !== val || (oldValue && val && oldValue.getTime && val.getTime)) { // Don't mark properties as dirty and trigger events unnecessarily
                                that._data[f] = val;
                                that._dirtyProperties[f] = oldValue;
                                that.triggerEvent('set', that, f, val);
                                that.triggerEvent('change', that, f, val);
                                session.propertyChanged(that, f, oldValue, val);
                            }
                        }, function() {
                            // getterCallback
                            return that._data[f];
                        });
                        that._data[field] = defaultValue(meta.fields[field]);
                    }
                }());
            }

            for ( var it in meta.hasOne) {
                if (meta.hasOne.hasOwnProperty(it)) {
                    (function () {
                        var ref = it;
                        var mixinClass = meta.hasOne[it].type.meta.isMixin ? ref + '_class' : null;
                        persistence.defineProp(that, ref, function(val) {
                            // setterCallback
                            var oldValue = that._data[ref];
                            var oldValueObj = that._data_obj[ref] || session.trackedObjects[that._data[ref]];
                            if (val == null) {
                                that._data[ref] = null;
                                that._data_obj[ref] = undefined;
                                if (mixinClass)
                                    that[mixinClass] = '';
                            } else if (val.id) {
                                that._data[ref] = val.id;
                                that._data_obj[ref] = val;
                                if (mixinClass)
                                    that[mixinClass] = val._type;
                                session.add(val);
                                session.add(that);
                            } else { // let's assume it's an id
                                that._data[ref] = val;
                            }
                            that._dirtyProperties[ref] = oldValue;
                            that.triggerEvent('set', that, ref, val);
                            that.triggerEvent('change', that, ref, val);
                            // Inverse
                            if(meta.hasOne[ref].inverseProperty) {
                                var newVal = that[ref];
                                if(newVal) {
                                    var inverse = newVal[meta.hasOne[ref].inverseProperty];
                                    if(inverse.list && inverse._filter) {
                                        inverse.triggerEvent('change', that, ref, val);
                                    }
                                }
                                if(oldValueObj) {
                                    var inverse = oldValueObj[meta.hasOne[ref].inverseProperty];
                                    if(inverse.list && inverse._filter) {
                                        inverse.triggerEvent('change', that, ref, val);
                                    }
                                }
                            }
                        }, function() {
                            // getterCallback
                            if (!that._data[ref]) {
                                return null;
                            } else if(that._data_obj[ref] !== undefined) {
                                return that._data_obj[ref];
                            } else if(that._data[ref] && session.trackedObjects[that._data[ref]]) {
                                that._data_obj[ref] = session.trackedObjects[that._data[ref]];
                                return that._data_obj[ref];
                            } else {
                                throw new Error("Property '" + ref + "' of '" + meta.name + "' with id: " + that._data[ref] + " not fetched, either prefetch it or fetch it manually.");
                            }
                        });
                    }());
                }
            }

            for ( var it in meta.hasMany) {
                if (meta.hasMany.hasOwnProperty(it)) {
                    (function () {
                        var coll = it;
                        if (meta.hasMany[coll].manyToMany) {
                            persistence.defineProp(that, coll, function(val) {
                                // setterCallback
                                if(val && val._items) {
                                    // Local query collection, just add each item
                                    // TODO: this is technically not correct, should clear out existing items too
                                    var items = val._items;
                                    for(var i = 0; i < items.length; i++) {
                                        persistence.get(that, coll).add(items[i]);
                                    }
                                } else {
                                    throw new Error("Not yet supported.");
                                }
                            }, function() {
                                // getterCallback
                                if (that._data[coll]) {
                                    return that._data[coll];
                                } else {
                                    var rel = meta.hasMany[coll];
                                    var inverseMeta = rel.type.meta;
                                    var inv = inverseMeta.hasMany[rel.inverseProperty];
                                    var direct = rel.mixin ? rel.mixin.meta.name : meta.name;
                                    var inverse = inv.mixin ? inv.mixin.meta.name : inverseMeta.name;

                                    var queryColl = new persistence.ManyToManyDbQueryCollection(session, inverseMeta.name);
                                    queryColl.initManyToMany(that, coll);
                                    queryColl._manyToManyFetch = {
                                        table: rel.tableName,
                                        prop: direct + '_' + coll,
                                        inverseProp: inverse + '_' + rel.inverseProperty,
                                        id: that.id
                                    };
                                    that._data[coll] = queryColl;
                                    return session.uniqueQueryCollection(queryColl);
                                }
                            });
                        } else { // one to many
                            persistence.defineProp(that, coll, function(val) {
                                // setterCallback
                                if(val && val._items) {
                                    // Local query collection, just add each item
                                    // TODO: this is technically not correct, should clear out existing items too
                                    var items = val._items;
                                    for(var i = 0; i < items.length; i++) {
                                        persistence.get(that, coll).add(items[i]);
                                    }
                                } else {
                                    throw new Error("Not yet supported.");
                                }
                            }, function() {
                                // getterCallback
                                if (that._data[coll]) {
                                    return that._data[coll];
                                } else {
                                    var queryColl = session.uniqueQueryCollection(new persistence.DbQueryCollection(session, meta.hasMany[coll].type.meta.name).filter(meta.hasMany[coll].inverseProperty, '=', that));
                                    that._data[coll] = queryColl;
                                    return queryColl;
                                }
                            });
                        }
                    }());
                }
            }

            if(this.initialize) {
                this.initialize();
            }

            for ( var f in obj) {
                if (obj.hasOwnProperty(f)) {
                    if(f !== 'id') {
                        persistence.set(that, f, obj[f]);
                    }
                }
            }
        } // Entity

        Entity.prototype = new Observable();

        Entity.meta = meta;

        Entity.prototype.equals = function(other) {
            return this.id == other.id;
        };

        Entity.prototype.toJSON = function() {
            var json = {id: this.id};
            for(var p in this._data) {
                if(this._data.hasOwnProperty(p)) {
                    if (typeof this._data[p] == "object" && this._data[p] != null) {
                        if (this._data[p].toJSON != undefined) {
                            json[p] = this._data[p].toJSON();
                        }
                    } else {
                        json[p] = this._data[p];
                    }
                }
            }
            return json;
        };


        /**
         * Select a subset of data as a JSON structure (Javascript object)
         *
         * A property specification is passed that selects the
         * properties to be part of the resulting JSON object. Examples:
         *    ['id', 'name'] -> Will return an object with the id and name property of this entity
         *    ['*'] -> Will return an object with all the properties of this entity, not recursive
         *    ['project.name'] -> will return an object with a project property which has a name
         *                        property containing the project name (hasOne relationship)
         *    ['project.[id, name]'] -> will return an object with a project property which has an
         *                              id and name property containing the project name
         *                              (hasOne relationship)
         *    ['tags.name'] -> will return an object with an array `tags` property containing
         *                     objects each with a single property: name
         *
         * @param tx database transaction to use, leave out to start a new one
         * @param props a property specification
         * @param callback(result)
         */
        Entity.prototype.selectJSON = function(tx, props, callback) {
            var that = this;
            var args = argspec.getArgs(arguments, [
                { name: "tx", optional: true, check: persistence.isTransaction, defaultValue: null },
                { name: "props", optional: false },
                { name: "callback", optional: false }
            ]);
            tx = args.tx;
            props = args.props;
            callback = args.callback;

            if(!tx) {
                this._session.transaction(function(tx) {
                    that.selectJSON(tx, props, callback);
                });
                return;
            }
            var includeProperties = {};
            props.forEach(function(prop) {
                var current = includeProperties;
                var parts = prop.split('.');
                for(var i = 0; i < parts.length; i++) {
                    var part = parts[i];
                    if(i === parts.length-1) {
                        if(part === '*') {
                            current.id = true;
                            for(var p in meta.fields) {
                                if(meta.fields.hasOwnProperty(p)) {
                                    current[p] = true;
                                }
                            }
                            for(var p in meta.hasOne) {
                                if(meta.hasOne.hasOwnProperty(p)) {
                                    current[p] = true;
                                }
                            }
                            for(var p in meta.hasMany) {
                                if(meta.hasMany.hasOwnProperty(p)) {
                                    current[p] = true;
                                }
                            }
                        } else if(part[0] === '[') {
                            part = part.substring(1, part.length-1);
                            var propList = part.split(/,\s*/);
                            propList.forEach(function(prop) {
                                current[prop] = true;
                            });
                        } else {
                            current[part] = true;
                        }
                    } else {
                        current[part] = current[part] || {};
                        current = current[part];
                    }
                }
            });
            buildJSON(this, tx, includeProperties, callback);
        };

        function buildJSON(that, tx, includeProperties, callback) {
            var session = that._session;
            var properties = [];
            var meta = getMeta(that._type);
            var fieldSpec = meta.fields;

            for(var p in includeProperties) {
                if(includeProperties.hasOwnProperty(p)) {
                    properties.push(p);
                }
            }

            var cheapProperties = [];
            var expensiveProperties = [];

            properties.forEach(function(p) {
                if(includeProperties[p] === true && !meta.hasMany[p]) { // simple, loaded field
                    cheapProperties.push(p);
                } else {
                    expensiveProperties.push(p);
                }
            });

            var itemData = that._data;
            var item = {};

            cheapProperties.forEach(function(p) {
                if(p === 'id') {
                    item.id = that.id;
                } else if(meta.hasOne[p]) {
                    item[p] = itemData[p] ? {id: itemData[p]} : null;
                } else {
                    item[p] = persistence.entityValToJson(itemData[p], fieldSpec[p]);
                }
            });
            properties = expensiveProperties.slice();

            persistence.asyncForEach(properties, function(p, callback) {
                if(meta.hasOne[p]) {
                    that.fetch(tx, p, function(obj) {
                        if(obj) {
                            buildJSON(obj, tx, includeProperties[p], function(result) {
                                item[p] = result;
                                callback();
                            });
                        } else {
                            item[p] = null;
                            callback();
                        }
                    });
                } else if(meta.hasMany[p]) {
                    persistence.get(that, p).list(function(objs) {
                        item[p] = [];
                        persistence.asyncForEach(objs, function(obj, callback) {
                            var obj = objs.pop();
                            if(includeProperties[p] === true) {
                                item[p].push({id: obj.id});
                                callback();
                            } else {
                                buildJSON(obj, tx, includeProperties[p], function(result) {
                                    item[p].push(result);
                                    callback();
                                });
                            }
                        }, callback);
                    });
                }
            }, function() {
                callback(item);
            });
        }; // End of buildJson

        Entity.prototype.fetch = function(tx, rel, callback) {
            var args = argspec.getArgs(arguments, [
                { name: 'tx', optional: true, check: persistence.isTransaction, defaultValue: null },
                { name: 'rel', optional: false, check: argspec.hasType('string') },
                { name: 'callback', optional: false, check: argspec.isCallback() }
            ]);
            tx = args.tx;
            rel = args.rel;
            callback = args.callback;

            var that = this;
            var session = this._session;

            if(!tx) {
                session.transaction(function(tx) {
                    that.fetch(tx, rel, callback);
                });
                return;
            }
            if(!this._data[rel]) { // null
                if(callback) {
                    callback(null);
                }
            } else if(this._data_obj[rel]) { // already loaded
                if(callback) {
                    callback(this._data_obj[rel]);
                }
            } else {
                var type = meta.hasOne[rel].type;
                if (type.meta.isMixin) {
                    type = getEntity(this._data[rel + '_class']);
                }
                type.load(session, tx, this._data[rel], function(obj) {
                    that._data_obj[rel] = obj;
                    if(callback) {
                        callback(obj);
                    }
                });
            }
        };

        /**
         * Currently this is only required when changing JSON properties
         */
        Entity.prototype.markDirty = function(prop) {
            this._dirtyProperties[prop] = true;
        };

        /**
         * Returns a QueryCollection implementation matching all instances
         * of this entity in the database
         */
        Entity.all = function(session) {
            var args = argspec.getArgs(arguments, [
                { name: 'session', optional: true, check: persistence.isSession, defaultValue: persistence }
            ]);
            session = args.session;
            return session.uniqueQueryCollection(new AllDbQueryCollection(session, entityName));
        };

        Entity.fromSelectJSON = function(session, tx, jsonObj, callback) {
            var args = argspec.getArgs(arguments, [
                { name: 'session', optional: true, check: persistence.isSession, defaultValue: persistence },
                { name: 'tx', optional: true, check: persistence.isTransaction, defaultValue: null },
                { name: 'jsonObj', optional: false },
                { name: 'callback', optional: false, check: argspec.isCallback() }
            ]);
            session = args.session;
            tx = args.tx;
            jsonObj = args.jsonObj;
            callback = args.callback;

            if(!tx) {
                session.transaction(function(tx) {
                    Entity.fromSelectJSON(session, tx, jsonObj, callback);
                });
                return;
            }

            if(typeof jsonObj === 'string') {
                jsonObj = JSON.parse(jsonObj);
            }

            if(!jsonObj) {
                callback(null);
                return;
            }

            function loadedObj(obj) {
                if(!obj) {
                    obj = new Entity(session);
                    if(jsonObj.id) {
                        obj.id = jsonObj.id;
                    }
                }
                session.add(obj);
                var expensiveProperties = [];
                for(var p in jsonObj) {
                    if(jsonObj.hasOwnProperty(p)) {
                        if(p === 'id') {
                            continue;
                        } else if(meta.fields[p]) { // regular field
                            persistence.set(obj, p, persistence.jsonToEntityVal(jsonObj[p], meta.fields[p]));
                        } else if(meta.hasOne[p] || meta.hasMany[p]){
                            expensiveProperties.push(p);
                        }
                    }
                }
                persistence.asyncForEach(expensiveProperties, function(p, callback) {
                    if(meta.hasOne[p]) {
                        meta.hasOne[p].type.fromSelectJSON(session, tx, jsonObj[p], function(result) {
                            persistence.set(obj, p, result);
                            callback();
                        });
                    } else if(meta.hasMany[p]) {
                        var coll = persistence.get(obj, p);
                        var ar = jsonObj[p].slice(0);
                        var PropertyEntity = meta.hasMany[p].type;
                        // get all current items
                        coll.list(tx, function(currentItems) {
                            persistence.asyncForEach(ar, function(item, callback) {
                                PropertyEntity.fromSelectJSON(session, tx, item, function(result) {
                                    // Check if not already in collection
                                    for(var i = 0; i < currentItems.length; i++) {
                                        if(currentItems[i].id === result.id) {
                                            callback();
                                            return;
                                        }
                                    }
                                    coll.add(result);
                                    callback();
                                });
                            }, function() {
                                callback();
                            });
                        });
                    }
                }, function() {
                    callback(obj);
                });
            }
            if(jsonObj.id) {
                Entity.load(session, tx, jsonObj.id, loadedObj);
            } else {
                loadedObj(new Entity(session));
            }
        };

        Entity.load = function(session, tx, id, callback) {
            var args = argspec.getArgs(arguments, [
                { name: 'session', optional: true, check: persistence.isSession, defaultValue: persistence },
                { name: 'tx', optional: true, check: persistence.isTransaction, defaultValue: null },
                { name: 'id', optional: false, check: argspec.hasType('string') },
                { name: 'callback', optional: true, check: argspec.isCallback(), defaultValue: function(){} }
            ]);
            Entity.findBy(args.session, args.tx, "id", args.id, args.callback);
        };

        Entity.findBy = function(session, tx, property, value, callback) {
            var args = argspec.getArgs(arguments, [
                { name: 'session', optional: true, check: persistence.isSession, defaultValue: persistence },
                { name: 'tx', optional: true, check: persistence.isTransaction, defaultValue: null },
                { name: 'property', optional: false, check: argspec.hasType('string') },
                { name: 'value', optional: false },
                { name: 'callback', optional: true, check: argspec.isCallback(), defaultValue: function(){} }
            ]);
            session = args.session;
            tx = args.tx;
            property = args.property;
            value = args.value;
            callback = args.callback;

            if(property === 'id' && value in session.trackedObjects) {
                callback(session.trackedObjects[value]);
                return;
            }
            if(!tx) {
                session.transaction(function(tx) {
                    Entity.findBy(session, tx, property, value, callback);
                });
                return;
            }
            Entity.all(session).filter(property, "=", value).one(tx, function(obj) {
                callback(obj);
            });
        }


        Entity.index = function(cols,options) {
            var opts = options || {};
            if (typeof cols=="string") {
                cols = [cols];
            }
            opts.columns = cols;
            meta.indexes.push(opts);
        };

        /**
         * Declares a one-to-many or many-to-many relationship to another entity
         * Whether 1:N or N:M is chosed depends on the inverse declaration
         * @param collName the name of the collection (becomes a property of
         *   Entity instances
         * @param otherEntity the constructor function of the entity to define
         *   the relation to
         * @param inverseRel the name of the inverse property (to be) defined on otherEntity
         */
        Entity.hasMany = function (collName, otherEntity, invRel) {
            var otherMeta = otherEntity.meta;
            if (otherMeta.hasMany[invRel]) {
                // other side has declared it as a one-to-many relation too -> it's in
                // fact many-to-many
                var tableName = meta.name + "_" + collName + "_" + otherMeta.name;
                var inverseTableName = otherMeta.name + '_' + invRel + '_' + meta.name;

                if (tableName > inverseTableName) {
                    // Some arbitrary way to deterministically decide which table to generate
                    tableName = inverseTableName;
                }
                meta.hasMany[collName] = {
                    type: otherEntity,
                    inverseProperty: invRel,
                    manyToMany: true,
                    tableName: tableName
                };
                otherMeta.hasMany[invRel] = {
                    type: Entity,
                    inverseProperty: collName,
                    manyToMany: true,
                    tableName: tableName
                };
                delete meta.hasOne[collName];
                delete meta.fields[collName + "_class"]; // in case it existed
            } else {
                meta.hasMany[collName] = {
                    type: otherEntity,
                    inverseProperty: invRel
                };
                otherMeta.hasOne[invRel] = {
                    type: Entity,
                    inverseProperty: collName
                };
                if (meta.isMixin)
                    otherMeta.fields[invRel + "_class"] = persistence.typeMapper ? persistence.typeMapper.classNameType : "TEXT";
            }
        }

        Entity.hasOne = function (refName, otherEntity, inverseProperty) {
            meta.hasOne[refName] = {
                type: otherEntity,
                inverseProperty: inverseProperty
            };
            if (otherEntity.meta.isMixin)
                meta.fields[refName + "_class"] = persistence.typeMapper ? persistence.typeMapper.classNameType : "TEXT";
        };

        Entity.is = function(mixin){
            var mixinMeta = mixin.meta;
            if (!mixinMeta.isMixin)
                throw new Error("not a mixin: " + mixin);

            mixin.meta.mixedIns = mixin.meta.mixedIns || [];
            mixin.meta.mixedIns.push(meta);

            for (var field in mixinMeta.fields) {
                if (mixinMeta.fields.hasOwnProperty(field))
                    meta.fields[field] = mixinMeta.fields[field];
            }
            for (var it in mixinMeta.hasOne) {
                if (mixinMeta.hasOne.hasOwnProperty(it))
                    meta.hasOne[it] = mixinMeta.hasOne[it];
            }
            for (var it in mixinMeta.hasMany) {
                if (mixinMeta.hasMany.hasOwnProperty(it)) {
                    mixinMeta.hasMany[it].mixin = mixin;
                    meta.hasMany[it] = mixinMeta.hasMany[it];
                }
            }
        }

        return Entity;
    }
};