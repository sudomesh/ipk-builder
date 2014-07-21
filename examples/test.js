#!/usr/bin/env node

var IPKBuilder = require('../index.js');

var builder = IPKBuilder();

builder.setBasePath('./foo');

builder.addFiles('./foo/bin', './foo/var');

builder.addConfFiles('./foo/etc/foo.conf');

builder.setMeta({  
    package: "foo",
    version: "0.1",
    maintainer: "Foo Bar <foobar@example.com>",
    architecture: "ar71xx",
    description: "Foo is a package for stuff and things.\n It is very convenient."

});

builder.build('foo-0.1.ipk', function(err, ipkPath) {
    if(err) {
        console.log("Encountered an error: " + err);
        return;
    }
    console.log("IPK written to: " + ipkPath);
});
