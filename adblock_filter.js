//Production code

var ss = require("sdk/simple-storage");
const {Cc, Ci} = require("chrome");
const self = require("sdk/self");
const urlModule = require("sdk/url");
const tabsModule = require("sdk/tabs");
const Request = require("sdk/request").Request;

var whitelist = [];
var blacklist = [];

// loads specified list of uris and returns as array of strings
// Usage:
//       load_list(String filename)

function load_list() {

    // Use this for loading the Easylist from online
    var easylist;
    Request({
        url: "https://easylist-downloads.adblockplus.org/easylist.txt",
        onComplete: function (response) {
            categorize(response.text.split("\n"));
        }
    }).get();
    return easylist;

    // Use this for loading Easylist from file
    // return self.data.load("easylist/easylist.txt").split("\n");
}

// Categorizes the easylist into a whitelist and a blacklist. It also divides 
// the blacklist into general domains, exact domains, and just by parts. All 
// arrays are stored as global variables because they will need to get used 
// repeatedly during the life of program
// Usage:
//       categorize(String[] list)

function categorize(easylist) {
    var rules = [];
    var exceptions = [];
    // divides easy list into blacklist and exceptions in blacklist (whitelist)
    for (i in easylist) {
        var line = easylist[i];
        //DOESN'T add any lines with two hashes in them, they are not requests
        if (line.indexOf("##") == -1 && line.indexOf("#@#" != -1)) {
            if (line.match(/^@@.*/)) {
                exceptions.push(line);
            } else {
                if (line.charAt(0) != "!") {
                    rules.push(line);
                }
            }
        }
    }
    for (i in rules) {
        var line = rules[i];
        if (line.match(/^\|\|.*/)) {
            line = line.substring(2, line.length)
        }
        blacklist.push(line);
    }
    for (i in exceptions) {
        var line = exceptions[i];
        if (line.match(/^@@.*/)) {
            if (line.match(/^\|\|.*/)) {
                line = line.substring(4, line.length)
            }
            else {
                line = line.substring(2, line.length)
            }
        }
        else if (line.match(/^\|\|.*/)) {
            line = line.substring(2, line.length)
        }
        whitelist.push(line);
    }
}

// This function returns if the following is image or not, "image" if image 
// and "~image" if not an image
// Usage:
//       is_image(String url)

function is_image(url) {
    var arr = url.split(".");
    var ext = arr[arr.length - 1];

    if (ext == "png" || ext == "rif" || ext == "tif" || ext == "tiff" || ext == "jpeg" ||
        ext == "jpg" || ext == "pcd" || ext == "jif" || ext == "gif" || ext == "jfif" ||
        ext == "jp2" || ext == "jpx" || ext == "pcd") {
        return "image";
    }
    else {
        return "~image";
    }
}

// This function returns if the following is script or not, "script" if script 
// and "~script" if not a script
//Usage:
//      is_script(String url)

function is_script(url) {
    var arr = url.split(".");
    var ext = arr[arr.length - 1];

    if (ext == "js") {
        return "script";
    }
    else {
        return "~script";
    }
}

// This function returns if the following is object or not, "object" if object 
// and "~object" if not an object
// Usage:
//       is_object(String url)

function is_object(url) {
    var arr = url.split(".");
    var ext = arr[arr.length - 1];

    if (ext == "swf" || ext == "class") {
        return "object";
    }
    else {
        return "~object";
    }
}

// This function returns if the following is stylesheet or not, "stylesheet" if stylesheet 
// and "~stylesheet" if not a stylesheet
// Usage:
//       is_stylesheet(String url)

function is_stylesheet(url) {
    var arr = url.split(".");
    var ext = arr[arr.length - 1];

    if (ext == "css") {
        return "stylesheet";
    }
    else {
        return "~stylesheet";
    }
}

// This function returns if the following is thirdparty or not, "thirdparty" if thirdparty
// and "~thirdparty" if not a thirdparty
// Usage:
//       is_thirdparty(String url)

function is_thirdparty(url) {
    //url = url request. window.location.hostname = host of current page
    //var hostname = window.location.hostname;
    var hostname = urlModule.URL(tabsModule.activeTab.url).host;
    if (hostname.indexOf("www") == 0) {
        hostname = hostname.replace("www.", "");
    }

    if (url.match(escape_reg_exp(hostname))) {
        return "~third-party";
    }
    else return "third-party";
}

//returns a JSON object representing the URL passed as a parameter.
// Usage: 
//       JSONObject parseUri(String sourceUri)
function parseUri(sourceUri) {
    var uriPartNames = ["source", "protocol", "authority", "domain", "port", "path", "directoryPath", "fileName", "query", "anchor"],
        uriParts = new RegExp("^(?:([^:/?#.]+):)?(?://)?(([^:/?#]*)(?::(\\d*))?)((/(?:[^?#](?![^?#/]*\\.[^?#/.]+(?:[\\?#]|$)))*/?)?([^?#/]*))?(?:\\?([^#]*))?(?:#(.*))?").exec(sourceUri),
        uri = {};

    for (var i = 0; i < 10; i++) {
        uri[uriPartNames[i]] = (uriParts[i] ? uriParts[i] : "");
    }

    /* Always end directoryPath with a trailing backslash if a path was present in the source URI
     Note that a trailing backslash is NOT automatically inserted within or appended to the "path" key */
    if (uri.directoryPath.length > 0) {
        uri.directoryPath = uri.directoryPath.replace(/\/?$/, "/");
    }

    if (uri.domain.indexOf("www.") == 0) {
        uri.domain = uri.domain.substring(4, uri.domain.length);
    }

    return uri;
}

// Changes string rule into regular expression equivalent for comparison. This
// is so the request domain can be matched against the AdBlock rule.
// Usage:
//       escape_reg_exp(String rule)

function escape_reg_exp(str) {
    var newStr = str.replace(/[\-\[\]\/\{\}\(\)\+\?\.\\\$\|]/g, "\\$&");
    newStr = newStr.replace("^", "\($|\/|\:\)");
    newStr = newStr.replace("*", "\(.*\)");
    newStr = newStr + "\(.*\)"
    return new RegExp(newStr);
}


// Determines whether or not a request URL is an ad or not. This is the 
// function that will be called by the other classes. The method first checks
// the request against the user blacklist. Then it checks the default AdBlock
// blacklist for a match. If there is a match, it checks the request against 
// the whitelist. If a request matches the blaclist and the whitelist, it is 
// not an ad, but otherwise, it is. If there is no match at all, the request
// is, by default, not an ad.
// Usage:
//       is_Ad(String url_request)

function is_Ad(url) {
    for (var i = 0; i < ss.storage.blacklist.length; i++) {
        if (parseUri(url).domain.match(escape_reg_exp(ss.storage.blacklist[i]))) {
            return true;
        }
    }
    if (is_blacklisted(url)) {
        if (is_whitelisted(url))
            return false;
        else return true;
    }
    else return false;
}

function is_whitelisted(url) {
    return matching_urls(url, whitelist);
}

function is_blacklisted(url) {
    return matching_urls(url, blacklist);
}


// This function is the main functionality of adblock_filter.js. This function
// checks a single request against a given list (whitelist/blacklist in our
// case) and then checks for additional options at the end of the the rule 
// (separated by a "$" delimeter). These options are then parsed and each rule
// is assigned file types it should and should not be applied to. If the 
// file type matches the rule's file types to block, it is blocked. Otherwise,
// it is not. 
// Usage:
//       matching_urls(String url, String[] rule_list)

function matching_urls(url, rule_list) {

    for (var i = 0; i < rule_list.length; i++) {

        var domain = rule_list[i].split("$");

        if (url.match(escape_reg_exp(domain[0]))) {
            // if there are no additional options and the url matches the rule,
            // return true.
            if (domain.length == 1) {
                return true;
            }

            //else, if additional options are present, check them all
            else {

                var options = domain[1].split(",");
                var domain_present = false;
                var domain_sublist = "";
                var blocked_rule;
                var negated = false;

                if (options[0].indexOf("~") == 0) {
                    negated = true;
                }

                for (var p = 0; p < options.length; p++) {
                    if (options[p].indexOf("domain=") != -1) {
                        domain_present = true;
                        domain_sublist = options[p].replace("domain=", "").split("|");
                    }

                    // since our rule consisted of several possible types of file types
                    // and different origins we decided creating an "object-like" structure
                    // would make the most sense. our object is basically a pool of all the
                    // possible type the rule can be, and whenever one of hte options is true
                    // it gets set to true in the object

                    // the later code inside this loop simply modifies this object as
                    // the url gets further parsing

                    // if ~ exists, we know all the rules will be negated 
                    if (negated == true) {
                        blocked_rule = {
                            "stylesheet": true,
                            "script": true,
                            "obj": true,
                            "image": true,
                            "obj_sub": true,
                            "subrequest": true
                        };
                        if (options[p] == "~stylesheet") {
                            blocked_rule.stylesheet = false;
                        }
                        else if (options[p] == "~script") {
                            blocked_rule.script = false;
                        }
                        else if (options[p] == "~object") {
                            blocked_rule.obj = false;
                        }
                        else if (options[p] == "~image") {
                            blocked_rule.image = false;
                        }
                        else if (options[p] == "~object-subrequest") {
                            blocked_rule.obj_sub = false;
                        }
                        else if (options[p] == "~subdocument") {
                            blocked_rule.subrequest = false;
                        }
                    }
                    else {
                        blocked_rule = {
                            "stylesheet": false,
                            "script": false,
                            "obj": false,
                            "image": false,
                            "obj_sub": false,
                            "subrequest": false
                        };
                        if (options[p] == "stylesheet") {
                            blocked_rule.image = true;
                        }
                        else if (options[p] == "script") {
                            blocked_rule.script = true;
                        }
                        else if (options[p] == "object") {
                            blocked_rule.obj = true;
                        }
                        else if (options[p] == "image") {
                            blocked_rule.image = true;
                        }
                        else if (options[p] == "obj_sub") {
                            blocked_rule.obj_sub = true;
                        }
                        else if (options[p] == "subdocument") {
                            blocked_rule.subrequest = true;
                        }
                    }

                }


                if (blocked_rule.stylesheet == false && blocked_rule.script == false &&
                    blocked_rule.obj == false && blocked_rule.image == false && blocked_rule.obj_sub == false
                    && blocked_rule.subrequest == false) {
                    blocked_rule = {"stylesheet": true, "script": true, "obj": true, "image": true, "obj_sub": true}
                }

                if (is_image(url) == "image") {
                    if (!blocked_rule.image) {
                        return false;
                    }

                }
                else if (is_stylesheet(url) == "stylesheet") {
                    if (!blocked_rule.stylesheet) {
                        return false;
                    }
                }
                else if (is_script(url) == "script") {
                    if (!blocked_rule.script) {
                        return false;
                    }
                }
                else if (is_object(url) == "object") {
                    if (!blocked_rule.obj) {
                        return false;
                    }
                }

                if (options.indexOf("third-party") != -1 && is_thirdparty(url) == "~third-party") {
                    return false;
                }

                else if (options.indexOf("~third-party") != -1 && is_thirdparty(url) == "third-party") {
                    return false;
                }

                // in this portion we iterate over the domains if any are present, these domains can
                // either be accepted or negated

                if (domain_present) {
                    if (domain_sublist[0].indexOf("~") != -1) {
                        for (n = 0; n < domain_sublist.length; n++) {
                            if (urlModule.URL(tabsModule.activeTab.url).host.match(escape_reg_exp(domain_sublist[n].replace("~", "")))) {
                                return false;
                            }
                        }
                    }
                    else {
                        var matched = false;
                        for (n = 0; n < domain_sublist.length; n++) {
                            if (urlModule.URL(tabsModule.activeTab.url).host.match(escape_reg_exp(domain_sublist[n]))) {
                                matched = true;
                            }
                        }
                        if (!matched) return false;
                    }
                }
            }
            return true;
        }
    }
    ;

    return false;
}

exports.categorize = categorize;
exports.load_list = load_list;
exports.is_Ad = is_Ad;

