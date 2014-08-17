#!/usr/bin/env node

var fs = require('fs');
var path = require('path');
var exec = require('child_process').exec;

var fse = require('fs-extra');

var IPKBuilder = function(opts) {

    this.opts = opts || {};
    this.files = [];
    this.confFiles = [];
    this.postScripts = [];

    this.basePath = path.resolve(__dirname);

    this.setBasePath = function(dir) {
        this.basePath = path.resolve(dir);
    };

    this.resolve = function(apath) {
        return {
            realPath: path.resolve(apath), // the path on the filesystem
            packagePath: path.relative(this.basePath, apath) // the path in the ipk
        };
    };

    this.addFiles = function() {
        var i;
        for(i=0; i < arguments.length; i++) {
            if(!fs.existsSync(arguments[i])) {
                if(opts.ignoreMissing) {
                    continue;
                } else {
                    throw arguments[i] + " does not exist";
                }
            }
            var stat = fs.statSync(arguments[i]);
            if(stat.isFile()) {
                this.files.push(this.resolve(arguments[i]));
            } else if(stat.isDirectory()) {
                var files = fs.readdirSync(arguments[i]);
                var j;
                for(j=0; j < files.length; j++) {
                    this.addFiles(path.join(arguments[i], files[j]));
                }
            } else {
                throw arguments[i] + " is neither a file nor a directory";
            }
        }
        return this.files;
    };

    this.addConfFiles = function() {
        var i;
        for(i=0; i < arguments.length; i++) {
            if(!fs.existsSync(arguments[i])) {
                if(opts.ignoreMissing) {
                    continue;
                } else {
                    throw arguments[i] + " does not exist";
                }
            }
            var stat = fs.statSync(arguments[i]);
            if(stat.isFile()) {
                this.confFiles.push(this.resolve(arguments[i]));
            } else {
                throw arguments[i] + " is not a file";
            }
        }
        return this.confFiles;
    };

    this.addPostScripts = function() {
        var i;
        for(i=0; i < arguments.length; i++) {
            if(!fs.existsSync(arguments[i])) {
                if(opts.ignoreMissing) {
                    continue;
                } else {
                    throw arguments[i] + " does not exist";
                }
            }
            var stat = fs.statSync(arguments[i]);
            if(stat.isFile()) {
                this.postScripts.push(path.resolve(arguments[i]));
            } else if(stat.isDirectory()) {
                var files = this.readdirSync(arguments[i]);
                var j;
                for(j=0; j < files.length; j++) {
                    this.addPostScripts(path.join(arguments[i], files[j]));
                }
            } else {
                throw arguments[i] + " is neither a file nor a directory";
            }
        }
        return this.postScripts;
    };
    
    this.setMeta = function(obj) {
        if(!obj.package) {
            throw "Missing required field 'package'. Should be set to package name.";
        }
        if(!obj.version) {
            throw "Missing required field 'version'. Should be set to package version string.";
        }
        if(!obj.maintainer) {
            throw "Missing required field 'maintainer'. Should be set to name and email of maintainer. E.g: 'Foo Bar <foobar@example.com>'";
        }
        if(!obj.architecture) {
            throw "Missing required field 'architecture'. Should be set to architecture name, e.g: 'ar71xx'";
        }
        if(!obj.description) {
            throw "Missing required field 'description'. Should be set to a string describing the package.";
        }
       
        this.meta = obj;
    };

    this.setControl = this.setMeta;

    this.stage = function() {
        var stageDir, i;

        do {
            stageDir = path.join('/tmp', 'ipkg-builder-' + Math.round(Math.random() * 100000000));
        } while(fs.exists(stageDir));

        fs.mkdirSync(stageDir);

        // create data dir
        var dataDir = path.join(stageDir, 'data')
        fs.mkdirSync(dataDir);

        // copy files to target dir with correct directory structure
        var files = this.files.concat(this.confFiles);
        var targetDir;
        for(i=0; i < files.length; i++) {
            targetDir = path.join(dataDir, path.dirname(files[i].packagePath));
            fse.mkdirpSync(targetDir);
            fse.copySync(files[i].realPath, path.join(targetDir, path.basename(files[i].realPath)))
        }

        // create control dir
        var controlDir = path.join(stageDir, 'control')
        fs.mkdirSync(path.join(stageDir, 'control'));

        // write version file
        fs.writeFileSync(path.join(stageDir, 'debian-binary'), '2.0');

        // write list of configuration files
        var confFilesList = '';
        for(i=0; i < this.confFiles.length; i++) {
            confFilesList += '/' + this.confFiles[i].packagePath + "\n";
        }
        if(confFilesList) {
            fs.writeFileSync(path.join(controlDir, 'conffiles'), confFilesList); 
        }
        
        // sort post scripts
        this.postScripts.sort(function(a, b) {
            if(a > b) {
                return 1;
            } else if(b > a) {
                return -1;
            } else {
                return 0;
            }
        });

        // combine post scripts into a single script and write it
        var postScript = '';
        for(i=0; i < this.postScripts.length; i++) {
            postScript += "## BEGIN " + path.basename(this.postScripts[i]) + " ##\n";
            postScript += fs.readFileSync(this.postScripts[i]) + "\n";
            postScript += "## END " + path.basename(this.postScripts[i]) + " ##\n";
        }
        if(postScript) {
            var postScriptPath = path.join(controlDir, 'postinst');
            fs.writeFileSync(postScriptPath)
            fs.chmodSync(postScriptPath, '755');
        }

        // write meta/control file
        var value;
        var control = '';
        for(key in this.meta) {
            value = this.meta[key];
            if(key == 'description') {
                value = value.replace(/\n/g, "\n ");
            }
            control += this.capitalize(key) + ': ' + value + "\n";
        }
        fs.writeFileSync(path.join(controlDir, 'control'), control);

        return stageDir;
    };

    this.build = function(outPath, callback) {

        try {
            var stageDir = this.stage();
        } catch(e) {
            callback(e.message);
            return;
        }

        var origDir = process.cwd();
        outPath = path.resolve(outPath);

        exec("fakeroot tar -pczf ../data.tar.gz *", {
            cwd: path.join(stageDir, 'data')
        }, function(err, stdout, stderr) {
            if(err) {
                callback("Error writing ipk: " + stderr);
                return;
            }
            exec("fakeroot tar -pczf ../control.tar.gz *", {
                cwd: path.join(stageDir, 'control')
            }, function(err, stdout, stderr) {
                if(err) {
                    callback("Error writing ipk: " + stderr);
                    return;
                }
                exec("tar -czf " + outPath + " data.tar.gz control.tar.gz debian-binary", {
                    cwd: stageDir
                }, function(err, stdout, stderr) {
                    if(err) {
                        callback("Error writing ipk: " + stderr);
                        return;
                    }
                    fse.remove(stageDir, function(err) {
                        if(err) {
                            callback("Error cleaning up /tmp staging directory: " + err);
                            return;
                        }
                        callback(null, outPath);
                    });
                });
            });
            
        });
    };

    this.capitalize = function(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    };
};

module.exports = function() {
    return new IPKBuilder();
};
