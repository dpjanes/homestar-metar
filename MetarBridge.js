/*
 *  MetarBridge.js
 *
 *  David Janes
 *  IOTDB.org
 *  2015-12-23
 *
 *  Copyright [2013-2015] [David P. Janes]
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

"use strict";

var iotdb = require('iotdb');
var _ = iotdb._;

var path = require('path');
var level = require('level');
var fs = require('fs');
var minimatch = require('minimatch');

var metar = require('./metar');
var stations = require('./stations');

var logger = iotdb.logger({
    name: 'homestar-metar',
    module: 'MetarBridge',
});

/**
 *  See {iotdb.bridge.Bridge#Bridge} for documentation.
 *  <p>
 *  @param {object|undefined} native
 *  only used for instances, should be 
 */
var MetarBridge = function (initd, native, metad) {
    var self = this;

    self.initd = _.defaults(initd,
        iotdb.keystore().get("bridges/MetarBridge/initd"), {
            station: "*",
            poll: 60
        }
    );
    self.native = native;  
    self.metad = metad || {};

    if (self.native) {
        self.metad["iot:thing-id"] = _.id.thing_urn.unique("Metar", self.native.station);
        self.metad["schema:name"] = self.native.name || self.native.station;
    }

};

MetarBridge.prototype = new iotdb.Bridge();

/* --- lifecycle --- */

/**
 *  See {iotdb.bridge.Bridge#discover} for documentation.
 */
MetarBridge.prototype.discover = function () {
    var self = this;

    logger.info({
        method: "discover"
    }, "called");

    /*
     *  This is the core bit of discovery. As you find new
     *  thimgs, make a new MetarBridge and call 'discovered'.
     *  The first argument should be self.initd, the second
     *  the thing that you do work with
     */
    self._db(function(error, db) {
        var stationd = {};
        var m = new metar.Metar(db);
        m.on("update", function(d) {
            var station = d.station;
            if (!station) {
                return;
            } else if (!minimatch(station, self.initd.station)) {
                return;
            }

            var bridge = stationd[station];
            if (!bridge) {
                db.get(station, function(error, metad) {
                    bridge = new MetarBridge(self.initd, d, metad);
                    stationd[station] = bridge;

                    self.discovered(bridge);
                });

                logger.info({
                    method: "/on(update)",
                    station: station,
                }, "result");
            } else {
                bridge._do_pull(d);
            }

        });
        m.on("end", function(d) {
            logger.info({
                method: "/on(end)",
                in_seconds: self.initd.poll,
            }, "reschedule");

            setTimeout(function() {
                m.pull();
            }, self.initd.poll * 1000);
        });
        m.pull();
    });
};

/**
 *  See {iotdb.bridge.Bridge#connect} for documentation.
 */
MetarBridge.prototype.connect = function (connectd) {
    var self = this;
    if (!self.native) {
        return;
    }

    self._validate_connect(connectd);

    self._do_pull(self.native);
};

MetarBridge.prototype._forget = function () {
    var self = this;
    if (!self.native) {
        return;
    }

    logger.info({
        method: "_forget"
    }, "called");

    self.native = null;
    self.pulled();
};

/**
 *  See {iotdb.bridge.Bridge#disconnect} for documentation.
 */
MetarBridge.prototype.disconnect = function () {
    var self = this;
    if (!self.native || !self.native) {
        return;
    }

    self._forget();
};

/* --- data --- */

/**
 *  See {iotdb.bridge.Bridge#push} for documentation.
 */
MetarBridge.prototype.push = function (pushd, done) {
    var self = this;
    if (!self.native) {
        done(new Error("not connected"));
        return;
    }

    self._validate_push(pushd, done);

    logger.info({
        method: "push",
        pushd: pushd
    }, "push");

    var qitem = {
        // if you set "id", new pushes will unqueue old pushes with the same id
        // id: self.number, 
        run: function () {
            self._pushd(pushd);
            self.queue.finished(qitem);
        },
        coda: function() {
            done();
        },
    };
    self.queue.add(qitem);
};

/**
 *  Do the work of pushing. If you don't need queueing
 *  consider just moving this up into push
 */
MetarBridge.prototype._push = function (pushd) {
    if (pushd.on !== undefined) {
    }
};

/**
 */
MetarBridge.prototype._do_pull = function (pulld) {
    var self = this;

    var pd = {};

    // we can do this better in the future
    _.mapObject(pulld, function(value, key) {
        if ((value === null) || (value === undefined) || (_.is.NaN(value))) {
            return;
        }
        if (_.is.Array(value)) {
            value = value[0];
        }

        if (_.is.Dictionary(value)) {
            _.mapObject(value, function(v, k) {
                if (v === null) {
                } else if (v === undefined) {
                } else if (_.is.NaN(v)) {
                } else if (_.is.Array(k)) {
                } else if (_.is.Dictionary(k)) {
                } else {
                    pd[key + "_" + k] = v;
                }
            });
        } else {
            pd[key] = value;
        }
    });

    self.pulled(pd);
};

/**
 *  See {iotdb.bridge.Bridge#pull} for documentation.
 */
MetarBridge.prototype.pull = function () {
    var self = this;
    if (!self.native) {
        return;
    }
};

/* --- state --- */

/**
 *  See {iotdb.bridge.Bridge#meta} for documentation.
 */
MetarBridge.prototype.meta = function () {
    var self = this;
    if (!self.native) {
        return;
    }

    return self.metad;
};

/**
 *  See {iotdb.bridge.Bridge#reachable} for documentation.
 */
MetarBridge.prototype.reachable = function () {
    return this.native !== null;
};

/**
 *  See {iotdb.bridge.Bridge#configure} for documentation.
 */
MetarBridge.prototype.configure = function (app) {
    var self = this;

    self.html_root = app.html_root || "/";

    app.use('/$', function (request, response) {
        self._configure_root(request, response);
    });

    return "METAR";
};

MetarBridge.prototype._configure_root = function (request, response) {
    var self = this;

    var template = path.join(__dirname, "templates", "root.html");
    var templated = {
        html_root: self.html_root,
    };

    self._db(function(error, db) {
        stations.save(db, function(error, n) {
            templated.error = _.error.message(error);
            templated.n = n;

            response
                .set('Content-Type', 'text/html')
                .render(template, templated);
        });
    });
};

var __db;
var __pending;

MetarBridge.prototype._db = function (callback) {
    if (__db) {
        return callback(null, __db);
    }

    if (__pending) {
        __pending.push(callback);
        return;
    }

    __pending = [];
    __pending.push(callback);

    try {
        fs.mkdirSync(".iotdb");
    } catch (x) {
    }

    __db = level('./.iotdb/metar', {
        valueEncoding: 'json',
    });

    __pending.map(function(p) {
        p(null, __db);
    });

    __pending = null;
};

/*
 *  API
 */
exports.Bridge = MetarBridge;
