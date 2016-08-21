/*
 *  metar.js
 *
 *  David Janes
 *  IOTDB
 *  2015-12-23
 *
 *  Pull raw data from the NOAA site if updated
 */

"use strict";

var iotdb = require('iotdb');
var _ = iotdb._;

var events = require('events');
var util = require('util');

var async = require('async');
var metar_parse = require("metar");
var unirest = require('unirest');
var fs = require('fs');

var logger = iotdb.logger({
    name: 'homestar-metar',
    module: 'metar',
});

var Metar = function (db) {
    var self = this;

    self.db = db;

    self.cycle_masterd = {};
    self.first = true;
    self.metard = {};

    events.EventEmitter.call(self);
    self.setMaxListeners(0);
};

util.inherits(Metar, events.EventEmitter);

/**
 *  Downloads the URL asynchronously.
 */
Metar.prototype._download = function(url, paramd, callback) {
    var self = this;

    paramd = _.defaults(paramd, {
        hash: false,
        head: false,   
        force: false,
    });

    var last_responsed = {};
    var request_headerd = {};

    /*
     *  Some pages don't properly do If-Modfied-Since && If-None-Match.
     *  This will check them with a Head first
     */
    var _post_unirest_head = function (response) {
        if (response.status !== 200) {
            return callback(response, null);
        }
        logger.debug({
            method: "_download/_post_unirest_head",
            last: last_responsed,
            headers: response.headers,
        }, "HEAD response");

        var response_headerd = response.headers;
        response_headerd.status = response.status;

        // console.log("HERE:A.1", response_headerd.etag,last_responsed.etag);
        if (response_headerd.etag && (response_headerd.etag === last_responsed.etag)) {
            // console.log("HERE:A.2");
            response.status = 304;
            return callback(response, null);
        }
        // console.log("HERE:A.3");

        if (response_headerd.modified && (response_headerd.modified === last_responsed.modified)) {
            response.status = 304;
            return callback(response, null);
        }

        _pre_unirest_get();
    };

    var _pre_unirest_get = function () {
        logger.info({
            method: "_download/_pre_unirest_get",
            url: url,
            headers: request_headerd,
        }, "do GET");

        unirest
            .get(url)
            .headers(request_headerd)
            .end(_post_unirest_get);
    };

    var _post_unirest_get = function (response) {
        logger.info({
            method: "_download/_post_unirest_get",
            status: response.status,
        });

        if (response.status !== 200) {
            return callback(response, null);
        }

        var response_headerd = response.headers;
        response_headerd.status = response.status;

        if (paramd.hash) {
            response_headerd['x-hash-md5'] = _.hash.md5(response.raw_body);

            if (!paramd.force && (response_headerd['x-hash-md5'] === last_responsed['x-hash-md5'])) {
                response.status = 304;
                return callback(response, null);
            }
        }
        
        self.db.put(url, response_headerd, function (error) {
            return callback(response, response.raw_body);
        });
    };

    var _post_db_get = function (error, _last_responsed) {
        if (!_.is.Empty(_last_responsed)) {
            last_responsed = _last_responsed;
        }

        if (!paramd.force) {
            if (last_responsed.etag) {
                request_headerd['If-None-Match'] = last_responsed.etag;
            }
            if (last_responsed.modified) {
                request_headerd['If-Modified-Since'] = last_responsed.modified;
            }
        }

        if (paramd.head && !paramd.force) {
            logger.info({
                method: "_download/_pre_db_get",
                url: url,
                headers: request_headerd,
            }, "do HEAD");

            unirest
                .head(url)
                .headers(request_headerd)
                .end(_post_unirest_head);
        } else {
            _pre_unirest_get();
        }
    }

    self.db.get(url, _post_db_get);
};

Metar.prototype._pull_master = function(paramd, callback) {
    var self = this;

    paramd = _.defaults(paramd, {
        force: false,
    });

    logger.info({
        method: "_pull_master",
        force: paramd.force,
    }, "called");

    self._download('http://weather.noaa.gov/pub/data/observations/metar/cycles/', {
        force: paramd.force,
        hash: true,
    }, function(response, raw_body) {
        if (response.status === 304) {
            return callback({
                end: true,
            });
        } else if (response.status !== 200) {
            return callback({
                end: true,
                error: new Error("status: " + response.status),
            });
        }

        const wks = raw_body
            .split("\n")
            .map(line => {
                const match = line.match(/.*(\d\dZ.TXT)<\/a>.*?<td align="right">([^<]*)/)
                if (!match) {
                    return;
                }

                const key = match[1];
                const when = new Date(match[2] + " UTC").toISOString();

                if (self.cycle_masterd[key] === when) {
                    return;
                }

                return [ when, key ]
            })
            .filter(wk => wk)
            .sort()
            .reverse();

        const wkfs = wks.map(wk => done => {
            self._pull_cycle({
                force: paramd.force,
                key: wk[1],
            }, callback, done);
        });

        wkfs.push(function(done) {
            callback({
                end: true,
            });
            done();
        });

        async.series(wkfs);
    });
}

Metar.prototype._pull_cycle = function(paramd, callback, done) {
    var self = this;

    logger.info({
        method: "_pull_cycle",
        key: paramd.key,
    }, "called");

    var url = 'http://weather.noaa.gov/pub/data/observations/metar/cycles/' + paramd.key;

    self._download(url, {
        force: paramd.force,
        head: true,
        hash: true,
    }, function(response, raw_body) {
        if (response.status === 304) {
            return done();
        } else if (response.status !== 200) {
            return done();
        }

        var timestamp = null;
        var collect = null;

        var lines = raw_body.split("\n");
        lines.map(function(line) {
            var date_match = line.match(/^\d\d\d\d\/\d\d\/\d\d \d\d:\d\d$/);
            if (date_match) {
                if (collect && timestamp) {
                    callback({
                        timestamp: timestamp,
                        station: collect[0].replace(/^([A-Z0-9]*).*$/, "$1"),
                        metar: collect.join("\n"),
                    });
                }

                try {
                    timestamp = new Date(line + " UTC").toISOString();
                    collect = [];
                } catch (x) {
                    timestamp = null;
                    collect = null
                }
            } else if (collect) {
                collect.push(line);
            }
        });

        if (collect && collect.length && timestamp) {
            callback({
                timestamp: timestamp,
                station: collect[0].replace(/^([A-Z0-9]*).*$/, "$1"),
                metar: collect.join("\n"),
            });
        }
        
        done(null, null);
    });
};

Metar.prototype.pull = function() {
    var self = this;

    self.emit("start");

    self._pull_master({
        force: self.first,
    }, function(d) {
        if (d.end) {
            self.first = false;
            return;
        }

        var od = self.metard[d.station];

        if (!od) {
        } else if (d.timestamp > od.timestamp) {
        } else {
            return;
        }

        try {
            var metard = metar_parse(d.metar);
            self.metard[d.station] = d;

            delete metard["time"]
            metard["@timestamp"] = d.timestamp;

            self.emit("update", metard);
        }
        catch (x) {
        }
    });

    self.emit("end");
};


/*
metar = new Metar();
metar.on("update", function(d) {
    logger.info({
        method: "/on(update)",
        d: d
    }, "result");
});
metar.pull();
*/

exports.Metar = Metar;

