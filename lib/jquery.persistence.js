/**
 * Copyright (c) 2010 Roberto Saccon <rsaccon@gmail.com>
 *
 * Permission is hereby granted, free of charge, to any person
 * obtaining a copy of this software and associated documentation
 * files (the "Software"), to deal in the Software without
 * restriction, including without limitation the rights to use,
 * copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following
 * conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
 * OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
 * WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
 * OTHER DEALINGS IN THE SOFTWARE.
 */


if(!window.jQuery) {
  throw "jQuery should be loaded before persistence.jquery.js"
}

if(!window.persistence) {
  throw "persistence.js should be loaded before persistence.jquery.js"
}

/**
 * crossbrowser implementation for entity-property
 */
persistence.defineProp = function(scope, field, setterCallback, getterCallback) {
    scope[field] = function(value) {
        if (value === undefined) {
            return getterCallback();
        } else {
            setterCallback(value);
            return scope;
        }
    };
};

/**
 * crossbrowser implementation for entity-property setter
 */
persistence.set = function(scope, fieldName, value) {
    if (persistence.isImmutable(fieldName)) throw "immutable field: "+fieldName;
    scope[fieldName](value);
    return scope;
};

/**
 * crossbrowser implementation for entity-property getter
 */
persistence.get = function(arg1, arg2) {
    var val = (arguments.length == 1) ? arg1 : arg1[arg2];
    return (typeof val === "function") ? val() : val;
};

/**
 * default implementation for converting an URL into an object which
 * describes the entity for re-routing ajax calls to persitencejs
 * Example URL: "rel/path/to/docs/about/intro.html"
 * persistence.pathPrefix = "rel/path/to"
 * => name: "Docs"
 * => path: "about/intro.html" 
 * (Images need to be embedded into HTML via data URL's)
 */
persistence.pathPrefix = "";
persistence.entityDescription = function(url) {
    if ((persistence.pathPrefix.length > 0) && (persistence.pathPrefix.length < url.length)) {
        var parts = url.substring(persistence.pathPrefix.length).split("/");
        return (parts.length == 0) ? null : {
            name: parts[1].charAt(0).toUpperCase() + parts[1].substring(1),
            pathName: "path",
            pathValue: parts.slice(2).join('/'),
            dataName: "data"
        };
    } else {
        return null
    }
};

/**
 * jquery stuff
 */
(function($){
    var originalDataMethod = $.fn.data;

    $.fn.data = function(name, data) {
        if (this[0] && this[0]._session && (this[0]._session === window.persistence)) {
            if (data) {
                this[0][name](data);
                return this;
            } else {
                return this[0][name]();
            }
        } else {
            return originalDataMethod.apply(this, arguments);
        }
    };

    if ($.mobile && window.openDatabase) {
        var originalAjaxMethod = $.ajax;

        $.ajax = function(settings) {
            var descr = persistence.entityDescription(settings.url); 
            if (descr === null) {
                originalAjaxMethod(settings);
            } else {
                var Entity = persistence.define(descr.name);
                Entity.findBy(descr.pathName, descr.pathValue, function(hit){
                    if (hit) {
                        if (settings.success)
                            settings.success(hit[descr.dataName]());
                    } else {
                        originalAjaxMethod({
                            url: descr.pathValue,
                            success: function(data) {
                                settings.success(data);
                                var obj = {};
                                obj[descr.pathName] = descr.pathValue;
                                obj[descr.dataName] = data;
                                var entity = new Entity(obj);
                                persistence.add(entity);
                                persistence.flush();
                            },
                            error: settings.error
                        });
                    }
                });
            }   
        };
    }

    if (persistence.sync) {
        persistence.sync.getJSON = function(url, success) {
            $.getJSON(url, null, success);
        };

        persistence.sync.postJSON = function(url, data, success) {
            $.ajax({
                url: url,
                type: 'POST',
                data: data,
                dataType: 'json',
                success: function(response) {
                    success(JSON.parse(response));
                }
            });
        };
    }
})(jQuery);