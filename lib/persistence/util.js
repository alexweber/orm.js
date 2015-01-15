module.exports = {
    arrayContains: function (ar, item) {
        var l = ar.length;
        for(var i = 0; i < l; i++) {
            var el = ar[i];
            if(el.equals && el.equals(item)) {
                return true;
            } else if(el === item) {
                return true;
            }
        }
        return false;
    },

    arrayRemove: function (ar, item) {
        var l = ar.length;
        for(var i = 0; i < l; i++) {
            var el = ar[i];
            if(el.equals && el.equals(item)) {
                ar.splice(i, 1);
                return;
            } else if(el === item) {
                ar.splice(i, 1);
                return;
            }
        }
    }
};