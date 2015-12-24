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
var bunyan = iotdb.bunyan;

var path = require('path');
var level = require('level');
var fs = require('fs');

var metar = require('./metar');
var stations = require('./stations');

var logger = bunyan.createLogger({
    name: 'homestar-metar',
    module: 'MetarBridge',
});

var db = null;

/**
 *  See {iotdb.bridge.Bridge#Bridge} for documentation.
 *  <p>
 *  @param {object|undefined} native
 *  only used for instances, should be 
 */
var MetarBridge = function (initd, native) {
    var self = this;

    self.initd = _.defaults(initd,
        iotdb.keystore().get("bridges/MetarBridge/initd"), {
            poll: 30
        }
    );
    self.native = native;   // the thing that does the work - keep this name

    if (db === null) {
        try {
            fs.mkdirSync(".iotdb");
        } catch (x) {
        }

        db = level('./.iotdb/metar');
    }
};

MetarBridge.prototype = new iotdb.Bridge();

MetarBridge.prototype.name = function () {
    return "MetarBridge";
};

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
    var stationd = {};
    var m = new metar.Metar(db);
    m.on("update", function(d) {
        db.get(d.station, function(error, value) {
            console.log(error, value);
        });

        return;
        var bridge = stationd[d.station];
        if (!bridge) {
            bridge = new MetarBridge(self.initd, d);
            stationd[d.station] = bridge;

            self.discovered(bridge);
        } else {
            bridge._do_pull(d);
        }

        logger.info({
            method: "/on(update)",
            d: d
        }, "result");
    });
    m.on("end", function(d) {
        logger.info({
            method: "/on(end)",
        }, "reschedule for 60 seconds");

        setTimeout(function() {
            m.pull();
        }, 60 * 1000);
    });
    m.pull();
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

    self._validate_push(pushd);

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
    self.pulled(pulld);
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

    return {
        "iot:thing-id": _.id.thing_urn.unique("Metar", self.native.station),
        "schema:name": self.native.name || "Metar",

        // "iot:thing-number": self.initd.number,
        // "iot:device-id": _.id.thing_urn.unique("Metar", self.native.uuid),
        // "schema:manufacturer": "",
        // "schema:model": "",
    };
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

    stations.save(db, function(error, n) {
        templated.error = _.error.message(error);
        templated.n = n;

        response
            .set('Content-Type', 'text/html')
            .render(template, templated);
    });
};

/*
 *  API
 */
exports.Bridge = MetarBridge;
