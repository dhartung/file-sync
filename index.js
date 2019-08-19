const path = require('path');
const fs = require('fs');
const _ = require('lodash');

function walk(dir) {
    return new Promise(function (resolve, reject) {
        var results = [];
        fs.readdir(dir, function (err, list) {
            if (err) {
                reject(err);
                return;
            }

            let pending = list.length;
            if (!pending) {
                resolve(results);
                return;
            }

            list.forEach(file => {
                file = path.resolve(dir, file);
                fs.stat(file, function (err, stat) {
                    if (stat && stat.isDirectory()) {
                        walk(file).then(res => {
                            results = results.concat(res)
                            if (!--pending) {
                                resolve(results);
                            }
                        }).catch(err => {
                            reject(err);
                            pending = 0;
                        })
                    } else {
                        results.push(file);
                        if (!--pending) {
                            resolve(results);
                        }
                    }
                });
            });
        });
    });
};

async function copyFile(src, dst) {
    try {
        await fs.promises.mkdir(path.dirname(dst), { recursive: true });
    } catch (ex) { }

    return await fs.promises.copyFile(src, dst);
}

async function symlink(src, dst) {
    try {
        await fs.promises.mkdir(path.dirname(dst), { recursive: true });
    } catch (ex) { }

    return await fs.promises.symlink(src, dst);
}

function getExtension(file) {
    const pos = file.lastIndexOf(".");
    return file.substr(pos + 1);
}

let configPath = "./config.json";
if (process.argv.length > 2) {
    const tmp = path.resolve(process.argv[2])
    try {        
        fs.accessSync(tmp);
        configPath = tmp;
    } catch (ex) {
        console.error("Could not open: " + tmp);
        return;
    }
}

const config = require(configPath);
async function main() {
    const pathLeft = path.resolve(config.source);
    const pathRight = path.resolve(config.destination);

    let [filesLeft, filesRight] = await Promise.all([walk(pathLeft), walk(pathRight)])
    filesLeft = filesLeft.map(x => x.replace(pathLeft, ""));
    filesRight = filesRight.map(x => x.replace(pathRight, ""));

    const difference = _.difference(filesLeft, filesRight);

    // Create hard copies
    const copyQueue = difference.filter(x => config.copy.includes(getExtension(x)));
    for (let file of copyQueue) {
        try {
            await copyFile(path.join(pathLeft, file), path.join(pathRight, file));
            console.log("Copy: " + file);
        } catch (err) {
            console.error("Could not copy file: " + file + ", Reason: " + err);
        }
    }

    // Create Links
    const linkQueue = difference.filter(x => config.symlink.includes(getExtension(x)));
    for (let file of linkQueue) {
        try {
            await symlink(path.join(pathLeft, file), path.join(pathRight, file));
            console.log("Symlink: " + file);
        } catch (err) {
            console.error("Could not create link: " + file + ", " + err);
        }
    }

    // Delete "dangling" links
    const probDelete = _.difference(filesRight, filesLeft).filter(
        x => config.copy.includes(getExtension(x)) || config.symlink.includes(getExtension(x))
    );

    if (probDelete.length > 0) {
        console.log("The following files doesn't exist at the source anymore:", probDelete);
    }
    console.log("Done.");
}

main();
