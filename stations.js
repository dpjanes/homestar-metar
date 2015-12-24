/*
 *  stations.js
 *
 *  David Janes
 *  IOTDB
 *  2015-12-24
 *
 *  Get station metadata from NOAA
 */

"use strict";

var iotdb = require('iotdb');
var _ = iotdb._;

var unirest = require('unirest')

var events = require('events');
var util = require('util');
var fs = require('fs');

var STATIONS_URL = 'http://weather.noaa.gov/data/nsd_bbsss.txt'

var logger = iotdb.logger({
    name: 'homestar-metar',
    module: 'stations',
});

var line_keys = [
    'wmo-block',
    'wmo-station',
    'schema:icaoCode',
    'schema:name',
    'schema:addressLocality',
    'schema:addressCountry',
    'wmo-region',
    'schema:latitude',
    'schema:longitude',
    'ua-latitude',
    'ua-longitude',
    'schema:elevation',
    'ua-elevation',
    'rbsn-indicator',
]
var ll_keys = [
    'schema:latitude',
    'schema:longitude',
    'ua-latitude',
    'ua-longitude',
]
var number_keys = [
    'wmo-block',
    'wmo-station',
    'wmo-region',
    'schema:elevation',
    'ua-elevation',
]

var Stations = function () {
    var self = this;

    events.EventEmitter.call(self);
    self.setMaxListeners(0);
};

util.inherits(Stations, events.EventEmitter);

Stations.prototype.load = function (callback) {
    var _convert_ll = function(value) {
        var match = value.match(/^(\d+)([-]\d+)([-]\d+)?([NSEW])$/);
        if (!match) {
            return;
        }

        var d = Math.abs(parseInt(match[1] || 0));
        var m = Math.abs(parseInt(match[2] || 0));
        var s = Math.abs(parseInt(match[3] || 0));
        var nswe = match[4];

        var l = d + m / 60.0 + s / 3600.0;
        var f = 100000;
        l = Math.round(l * f) / f;

        if ((nswe === "W") || (nswe === "S")) {
            l = -l;
        }

        return l;
    };
    var _fetch_stations = function() {
        unirest
            .get(STATIONS_URL)
            .end(_process_station_url);
    };

    var _process_station_url = function(response) {
        if (response.status !== 200) {
            return callback(new Error("could not fetch stations: " + response.status), null);
        }

        var lines = response.raw_body.split("\r\n");
        lines.map(_process_line);

        callback(null, null);
    };

    var _process_line = function(line) {
        var line_values = line.split(";");
        var d = _.object(line_keys, line_values);
        
        ll_keys.map(function(ll_key) {
            var value = d[ll_key];
            if (value) {
                d[ll_key] = _convert_ll(value);
            }
        });

        number_keys.map(function(number_key) {
            var value = d[number_key];
            if (value) {
                d[number_key] = parseInt(value);
            }
        });

        var station = d['schema:icaoCode'];
        if (!station || !station.length || station.match(/^-/)) {
            return;
        }

        var d_keys = _.keys(d);
        d_keys.map(function(d_key) {
            if (d_key.indexOf(':') === -1) {
                delete d[d_key];
                return;
            }

            var d_value = d[d_key];
            if (d_value === undefined) {
                delete d[d_key];
                return;
            }

            if (_.is.Number(d_value) && isNaN(d_value)) {
                delete d[d_key];
                return;
            }

            if (_.is.String(d_value) && (d_value === '')) {
                delete d[d_key];
                return;
            }
        });

        callback(null, d);
    };

    _fetch_stations();
};


/**
 *  Will callback with one record at a time,
 *  then with a null record.
 */
exports.load = function(callback) {
    (new Stations()).load(callback);
};

/**
 *  Will save, callback with the numbe rof records saved
 */
exports.save = function(db, callback) {
    var n = 0;
    var stations = new Stations();
    stations.load(function(error, stationd) {
        if (stationd) {
            n += 1;

            db.put(stationd['schema:icaoCode'], JSON.stringify(stationd), function (error) {
                if (error) {
                    callback(error, 0);
                    callback = function() {};
                }
            });
        } else if (error) {
            callback(error, 0);
            callback = function() {};
        } else {
            callback(null, n);
            callback = function() {};
        }
    });
};
