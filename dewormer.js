( function(root, factory) {
        if ( typeof define === 'function' && define.amd) {
            // AMD. Register as an anonymous module.
            define(['uglify-js'], function(UglifyJS) {
                return (root.returnExportsGlobal = factory(UglifyJS));
            });
        } else if ( typeof exports === 'object') {
            // Node. Does not work with strict CommonJS, but
            // only CommonJS-like enviroments that support module.exports,
            // like Node.
            module.exports = factory(require('uglify-js'));
        } else {
            // Browser globals
            root.dewormer = factory(root.UglifyJS);
        }
    }(this, function(UglifyJS) {

        var basicDebuggerStatement = ';(function debuggerStatement() {' + '%%%log({' + 'scope : %%%directives,' + 'stack : %%%stack' + '});' + 'if ( typeof ACTIVE_DEBUG !== "undefined") {' +
        // prompt is blocking function - it halts execution of JavaScript code
        'eval(prompt("Enter code to eval"));' + '}' + '}());';

        function splice_string(str, begin, end, replacement) {
            return str.substr(0, begin) + replacement + str.substr(end);
        }

        function getScopeDirectVarsNames(scope) {
            return scope && Object.keys(scope.variables._values).map(function(el) {
                return el.slice(1);
            });
        }

        function getSimplifiedScope(scope) {
            var myRet = {};
            myRet.variables = getScopeDirectVarsNames(scope);
            myRet.top = scope.parent_scope && getSimplifiedScope(scope.parent_scope);
            return myRet;
        }

        function decompressArrayToKeys(arr) {
            var ret = {}, i;
            for ( i = 0; i < arr.length; i++) {
                ret[arr[i]] = arr[i];
            }
            return ret;
        }

        function getStackTrace() {
            // functions have to be defined in function's code

            function isInArray(arr, what) {
                var i;
                for ( i = 0; i < arr.length; i++) {
                    if (what === arr[i]) {
                        return true;
                    }
                }
                return false;
            }

            function getFuncName(func) {
                if (func.name) {
                    return func.name;
                }
                if ((function a() {
                }).name === 'a') {
                    return 'anonymous';
                }
                var ret = Function.prototype.toString.call(fun);
                ret = ret.substr('function '.length);
                ret = ret.substr(0, ret.indexOf('('));
                // doesn't work with commented code
                // eg.
                // function /* bar(!) */ foo {}
                // but still OK
                return ret;
            }

            var error = Error();

            if (error.stack || error.stacktrace) {
                return error.stack || error.stacktrace;
            }
            var currFunc, list;
            try {
                list = [];

                while (true) {
                    currFunc = arguments.callee.caller;
                    if (isInArray(list, currFunc)) {
                        list.push('Recursion (' + getFuncName(currFunc) + ')');
                        break;
                    } else if (currFunc) {
                        list.push(getFuncName(currFunc));
                    } else {
                        list.push('Top level script');
                        break;
                    }
                }
                return 'Reconstructed stack: ' + list.join(' -> ') + ';';
            } catch (e) {
                // strict mode error; Shouldn't happen...
                return 'Couldn\'t retrieve stack';
            }
        }

        function createScopeLogger(scope) {
            var replace = {
                stack : '(' + getStackTrace.toString() + '())',
                log : '(console ? (function(arg) {console.log(arg)}) : Function())',
                directives : ( function() {
                        var scopeClone = JSON.parse(JSON.stringify(scope), null, 1);
                        var parsedScope = JSON.stringify(( function parseScope(scope, base) {
                                if (!scope) {
                                    return scope;
                                }

                                scope.variables = decompressArrayToKeys(scope.variables);
                                scope.top = parseScope(scope.top, false);
                                return scope;
                            }(scopeClone, true)));
                        return parsedScope.replace('"', '', 'g');
                    }())
            };
            var code = basicDebuggerStatement;
            var data, key;
            for (key in replace) {
                if (Object.hasOwnProperty.call(replace, key)) {
                    data = replace[key];
                    code = code.replace('%%%' + key, data, 'g');
                }
            }

            return code;
        }

        return function transform(input, options) {

            var ast = UglifyJS.parse(input);
            var i;
            ast.figure_out_scope();
            var replaces = [];
            var walker = new UglifyJS.TreeWalker(function(node) {
                if ( node instanceof UglifyJS.AST_Debugger) {
                    var p = walker.find_parent(UglifyJS.AST_Scope);
                    var simplifiedScope = getSimplifiedScope(p);
                    var replaceData = {
                        val : node,
                        what : createScopeLogger(simplifiedScope)
                    };
                    replaces.push(replaceData);
                }
            });
            ast.walk(walker);

            // Modified code from http://lisperator.net/blog/using-uglifyjs-for-code-refactoring/
            for ( i = replaces.length; --i >= 0;
            void 0) {
                var node = replaces[i].val;
                input = splice_string(input, node.start.pos, node.end.endpos, replaces[i].what);
            }

            return input;
        };
    }));
