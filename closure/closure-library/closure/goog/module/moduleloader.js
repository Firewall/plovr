// Copyright 2008 The Closure Library Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS-IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * @fileoverview The module loader which uses the BulkLoader to load the URIs.
 *
 *
 */

goog.provide('goog.module.ModuleLoader');

goog.require('goog.array');
goog.require('goog.debug.Logger');
goog.require('goog.dom');
goog.require('goog.events.EventHandler');
goog.require('goog.module.BaseModuleLoader');
goog.require('goog.net.BulkLoader');
goog.require('goog.net.EventType');
goog.require('goog.userAgent');


/**
 * A class that loads Javascript modules.
 * @constructor
 * @extends {goog.module.BaseModuleLoader}
 */
goog.module.ModuleLoader = function() {
  goog.module.BaseModuleLoader.call(this);

  /**
   * Event handler for managing handling events.
   * @type {goog.events.EventHandler}
   * @private
   */
  this.eventHandler_ = new goog.events.EventHandler(this);
};
goog.inherits(goog.module.ModuleLoader, goog.module.BaseModuleLoader);


/**
 * A logger.
 * @type {goog.debug.Logger}
 * @protected
 */
goog.module.ModuleLoader.prototype.logger = goog.debug.Logger.getLogger(
    'goog.module.ModuleLoader');


/** @inheritDoc */
goog.module.ModuleLoader.prototype.loadModulesInternal = function(
    ids, moduleInfoMap, opt_successFn, opt_errorFn, opt_timeoutFn,
    opt_forceReload) {
  var uris = [];
  for (var i = 0; i < ids.length; i++) {
    goog.array.extend(uris, moduleInfoMap[ids[i]].getUris());
  }
  this.logger.info('loadModules ids:' + ids + ' uris:' + uris);

  // In prod, we don't load via a script tag because it is difficult to
  // determine if the script has been loaded and to handle errors conditions.
  if (this.getDebugMode()) {
    this.loadModulesInDebugMode_(uris);
  } else {
    var bulkLoader = new goog.net.BulkLoader(uris);
    var eventHandler = this.eventHandler_;
    eventHandler.listen(
        bulkLoader,
        goog.net.EventType.SUCCESS,
        goog.bind(this.handleSuccess, this, bulkLoader, ids,
            opt_successFn, opt_errorFn),
        false,
        null);
    eventHandler.listen(
        bulkLoader,
        goog.net.EventType.ERROR,
        goog.bind(this.handleError, this, bulkLoader, ids, opt_errorFn),
        false,
        null);
    // TODO(user): Need to handle timeouts in the module loading code.

    bulkLoader.load();
  }
};


/**
 * Loads and evaluates the JavaScript files at the specified URIs, in order.
 * This method uses &lt;script> tags rather than XHRs to load the files. This
 * makes it possible to debug and inspect stack traces more easily. It's also
 * possible to use it to load JavaScript files that are hosted on another
 * domain.
 * @param {Array.<string>} uris The URIs to load.
 * @private
 */
goog.module.ModuleLoader.prototype.loadModulesInDebugMode_ = function(uris) {
  if (!uris.length) {
    return;
  }

  var createScript = function(uri) {
    var scriptEl = goog.dom.createElement('script');
    scriptEl.src = uri;
    scriptEl.type = 'text/javascript';
    return scriptEl;
  };

  var documentElement = document.documentElement;
  if (goog.userAgent.GECKO) {
    // For <script> tags that are loaded in this manner, Gecko ensures that
    // tag order is consistent with evaluation order. Unfortunately, other
    // browsers do not make that guarantee. So the other browsers need a slower
    // and more complex implementation.
    for (var i = 0; i < uris.length; i++) {
      var scriptEl = createScript(uris[i]);
      documentElement.appendChild(scriptEl);
    }
  } else {
    var popAndLoadNextScript = function() {
      var uri = uris.shift();
      var scriptEl = createScript(uri);
      if (uris.length) {
        if (goog.userAgent.IE) {
          scriptEl.onreadystatechange = function() {
            if (!this.readyState || this.readyState == 'loaded' ||
                this.readyState == 'complete') {
              // Guard against redundant state changes.
              scriptEl.onreadystatechange = goog.nullFunction;
              popAndLoadNextScript();
            }
          };
        } else {
          scriptEl.onload = popAndLoadNextScript;
        }
      }
      documentElement.appendChild(scriptEl);
    };
    popAndLoadNextScript();
  }
};


/**
 * Handles a successful response to a request for one or more modules.
 *
 * @param {goog.net.BulkLoader} bulkLoader The bulk loader.
 * @param {Array.<string>} moduleIds The ids of the modules requested.
 * @param {function()} successFn The callback for success.
 * @param {function(?number)} errorFn The callback for error.
 */
goog.module.ModuleLoader.prototype.handleSuccess = function(
    bulkLoader, moduleIds, successFn, errorFn) {
  var jsCode = bulkLoader.getResponseTexts().join('\n');

  this.handleRequestSuccess(jsCode, moduleIds, successFn, errorFn);

  // NOTE: A bulk loader instance is used for loading a set of module ids. Once
  // these modules have been loaded succesfully or in error the bulk loader
  // should be disposed as it is not needed anymore. A new bulk loader is
  // instantiated for any new modules to be loaded. The dispose is called
  // on a timer so that the bulkloader has a chance to release its
  // objects.
  goog.Timer.callOnce(bulkLoader.dispose, 5, bulkLoader);
};


/**
 * Handles an error during a request for one or more modules.
 * @param {goog.net.BulkLoader} bulkLoader The bulk loader.
 * @param {Array.<string>} moduleIds The ids of the modules requested.
 * @param {function(?number)} errorFn The function to call on failure.
 * @param {number} status The response status.
 */
goog.module.ModuleLoader.prototype.handleError = function(
    bulkLoader, moduleIds, errorFn, status) {
  this.handleRequestError(moduleIds, errorFn, status);

  // NOTE: A bulk loader instance is used for loading a set of module ids. Once
  // these modules have been loaded succesfully or in error the bulk loader
  // should be disposed as it is not needed anymore. A new bulk loader is
  // instantiated for any new modules to be loaded. The dispose is called
  // on another thread so that the bulkloader has a chance to release its
  // objects.
  goog.Timer.callOnce(bulkLoader.dispose, 5, bulkLoader);
};


/** @inheritDoc */
goog.module.ModuleLoader.prototype.disposeInternal = function() {
  goog.module.ModuleLoader.superClass_.disposeInternal.call(this);

  this.eventHandler_.dispose();
  this.eventHandler_ = null;
};
