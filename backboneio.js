(function() {

  // Save a reference to the global object (`window` in the browser, `global`
  // on the server).
  var root = this;

  // The top-level namespace. All public Backbone classes and modules will
  // be attached to this. Exported for both CommonJS and the browser.
  var BackboneIO, server = false;
  if (typeof exports !== 'undefined') {
    BackboneIO = exports;
    server = true;
  } else {
    BackboneIO = root.BackboneIO = {};
  }

  // Require Underscore, if we're on the server, and it's not already present.
  var _ = root._;
  if (!_ && (typeof require !== 'undefined')) _ = require('underscore');

  // Require Backbone, if we're on the server, and it's not already present.
  var Backbone = root.Backbone;
  if (!Backbone && (typeof require !== 'undefined')) Backbone = require('backbone');

  BackboneIO.sync = (function (method, model, options) {
    var getUrl = function (object) {
      if (options && options.url) {
        return _.isFunction(options.url) ? options.url() : options.url;
      }

      if (!(object && object.url)) return null;
      return _.isFunction(object.url) ? object.url() : object.url;
    };

    options = options || {};
    var url = options.url || getUrl(model);
    var cmd = url.split('/')
    , namespace = (cmd[0] !== '') ? cmd[0] : cmd[1]; // if leading slash, ignore

    var params = _.extend({
      req: namespace + ':' + method
    }, options);

    if ( !params.data && model ) {
      params.data = model.toJSON() || {};
    }

    if(typeof window !== 'undefined')
    {
      var io = model.socket || window.socket || BackboneIO.socket;
      io.emit(params.req, params.data, function (err, data) {
        if (err) {
          options.error(err);
        } else {
          if(options.success) options.success(data);
        }
      });
    }
    else
    {
      _.each(this.sockets, function(socket){
        socket.emit(params.req,params.data, function(err, data) { if(err) console.log(err); });
      });
    }
  });

/**
 * # .ioBind(event, callback, [context])
 *
 * Bind and handle trigger of socket.io events for models.
 *
 * ### Guidelines
 *
 * Do NOT bind to reserved backbone events, such as `change`, `remove`, and `add`.
 * Proxy these events using different event tags such as `update`, `delete`, and `create`.
 *
 * The socket.io socket must either exist at `window.socket`, `Backbone.socket`, or
 * `this.socket` or it must be passed as the second argument.
 *
 * ### Example
 *
 * * Model definition has url: `my_model`
 * * Model instance has id: `abc123`
 *
 * #### Create a new bind (client-side):
 *
 *     model.ioBind('update', window.io, this.updateView, this);
 *
 * #### Send socket.io message (server-side)
 *
 *     socket.emit( 'my_model/abc123:update', { title: 'My New Title' } );
 *
 * @name ioBind
 * @param {String} eventName
 * @param {Object} io from active socket.io connection (optional)
 * @param {Function} callback
 * @param {Object} context (optional) object to interpret as this on callback
 * @api public
 */

    Backbone.Model.prototype.ioBind = Backbone.Collection.prototype.ioBind =  function (eventName, io, callback, context) {
      var url = (typeof this.url == 'function') ? this.url() : this.url;
      var ioEvents = this._ioEvents || (this._ioEvents = {})
        , globalName = url + ':' + eventName
        , self = this;
      if ('function' == typeof io) {
        context = callback;
        callback = io;
        io = this.socket || window.socket || Backbone.socket;
      }
      var event = {
        name: eventName,
        global: globalName,
        cbLocal: callback,
        cbGlobal: function (data) {
            var args = [eventName];
            args.push.apply(args, arguments);
            self.trigger.apply(self, args);
        }
      };
      this.bind(event.name, event.cbLocal, (context || self));
      io.on(event.global, event.cbGlobal);
      if (!ioEvents[event.name]) {
        ioEvents[event.name] = [event];
      } else {
        ioEvents[event.name].push(event);
      }
      return this;
    },

/**
 * # .ioUnbind(event, [callback])
 *
 * Unbind model triggers and stop listening for server events for a specific
 * event and optional callback.
 *
 * The socket.io socket must either exist at `window.socket`, `Backbone.socket`,
 * or `this.socket` or it must be passed as the second argument.
 *
 * @name ioUnbind
 * @param {String} eventName
 * @param {Object} io from active socket.io connection
 * @param {Function} callback (optional) If not provided will remove all callbacks for eventname.
 * @api public
 */

Backbone.Model.prototype.ioUnbind = Backbone.Collection.prototype.ioUnbind = function (eventName, io, callback) {
  var ioEvents = this._ioEvents || (this._ioEvents = {})
    , globalName = this.url() + ':' + eventName;
  if ('function' == typeof io) {
    callback = io;
    io = this.socket || window.socket || Backbone.socket;
  }
  var events = ioEvents[eventName];
  if (!_.isEmpty(events)) {
    if (callback && 'function' === typeof callback) {
      for (var i = 0, l = events.length; i < l; i++) {
        if (callback == events[i].cbLocal) {
          this.unbind(events[i].name, events[i].cbLocal);
          io.removeListener(events[i].global, events[i].cbGlobal);
          events[i] = false;
        }
      }
      events = _.compact(events);
    } else {
      this.unbind(eventName);
      io.removeAllListeners(globalName);
    }
    if (events.length === 0) {
      delete ioEvents[eventName];
    }
  }
  return this;
};

/**
 * # .ioUnbindAll()
 *
 * Unbind all callbacks and server listening events for the given model.
 *
 * The socket.io socket must either exist at `window.socket`, `Backbone.socket`,
 * or `this.socket` or it must be passed as the only argument.
 *
 * @name ioUnbindAll
 * @param {Object} io from active socket.io connection
 * @api public
 */

Backbone.Model.prototype.ioUnbindAll = Backbone.Collection.prototype.ioUnbindAll = function (io) {
  var ioEvents = this._ioEvents || (this._ioEvents = {});
  if (!io) io = this.socket || window.socket || Backbone.socket;
  for (var ev in ioEvents) {
    this.ioUnbind(ev, io);
  }
  return this;
};

  BackboneIO.Model = Backbone.Model.extend({
    sockets: {},
    bindServer: function(socket){
      this.sockets[socket.id] = socket;
      if(!this.id) this.id = this.get('id');
      _.bindAll(this, 'onClientChange', 'onClientDelete', 'modelCleanup');
      if (!this.noIoBind) {
        this.ioBind('update', socket, this.onClientChange, this);
        this.ioBind('delete', socket, this.onClientDelete, this);
      }
    },
    unbindServer: function(socket) {
      this.ioUnbindAll(socket);
      delete this.sockets[socket.id];
    },
    onClientChange: function(resp){
       if(!this.set(this.parse(resp))) return false;
       this.save();
    },
    onClientDelete: function(resp){
      this.destroy();
      if (this.collection) {
        this.collection.remove(this);
      } else {
        this.trigger('remove', this);
      }
      var self = this;
      _.each(this.sockets, function(socket){
        self.modelCleanup(socket);
      });
    },
    bindClient: function () {
      if(!this.id) this.id = this.get('id');
      _.bindAll(this, 'onServerChange', 'onServerDelete', 'modelCleanup');
      if (!this.noIoBind) {
        this.ioBind('update', this.onServerChange, this);
        this.ioBind('delete', this.onServerDelete, this);
      }
    },
    onServerChange: function(resp){
      if (!this.set(this.parse(resp))) return false;
    },
    onServerDelete: function(resp){
      if (this.collection) {
        this.collection.remove(this);
      } else {
        this.trigger('remove', this);
      }
      this.modelCleanup(socket);
    },
    modelCleanup: function(io){
      this.ioUnbindAll(io);
      return this;
    },
    sync: BackboneIO.sync,
  });

  BackboneIO.Collection = Backbone.Collection.extend({
    sockets: {},
    bindServer: function(socket){
      if(typeof socket.id === 'undefined') return false;
      this.sockets[socket.id] = socket;
      if(typeof this.id === 'undefined') this.id = this.cid;
      _.bindAll(this, 'onClientRead','onClientCreate', 'collectionCleanup');
      if (!this.noIoBind) {
          console.log ('binding on', this.url);
        // Hack, because it create duplicated entries
          socket.on(this.url+':create', this.onClientCreate);
        // Hack, because with iobind the callback function is undefined
        //this.ioBind('read', socket, this.onClientRead, this);
        socket.on(this.url+':read', this.onClientRead);
      }
      _.each(this.models,function(model){
        model.bindServer(socket);
      });
    },
    unbindServer: function(socket) {
      this.ioUnbindAll(socket);
      socket.removeListener(this.url+':create', this.onClientCreate);
      socket.removeListener(this.url+':read', this.onClientRead);
      delete this.sockets[socket.id];
    },
    onClientRead: function(data,fn){
      fn(null,this.toJSON());
    },
    onClientCreate: function(data) {
        console.log ('create');
      var exists = this.get(data.id);
      if (!exists) {
        exists = new this.model(data);
        this.add(exists);
        (this.sync || Backbone.sync).call(exists, 'create', exists, { url: this.url });
      } else {
        exists.set(data);
        exists.save();
      }
      _.each(this.sockets, function(socket){
        exists.bindServer(socket);
      });
    },
    bindClient: function () {
      _.bindAll(this, 'onServerCreate', 'collectionCleanup');
      if (!this.noIoBind) {
        this.ioBind('create', this.onServerCreate, this);
        this.ioBind('update', this.onServerCreate, this);
      }
      this.each(function(model) {
        model.bindClient();
      });
    },
    onServerCreate: function(data) {
     var exists = this.get(data.id);
     if (!exists) {
       exists = new this.model(data);
       exists.bindClient();
       this.add(exists);
     } else {
       exists.set(data);
       exists.save();
     }
    },
    collectionCleanup: function (callback) {
      this.ioUnbindAll();
      this.each(function (model) {
        model.modelCleanup();
      });
      return this;
    },
    sync: BackboneIO.sync,
  });

  BackboneIO.View = Backbone.View.extend({
  });

  BackboneIO.History = Backbone.History;

  BackboneIO.Router = Backbone.Router.extend({
  });

if(server) module.exports = BackboneIO;
else root.BackboneIO = BackboneIO;

}).call(this);
