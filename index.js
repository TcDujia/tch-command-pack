'use strict';
exports.name = 'pack';
exports.usage = '<command> [options]';
exports.desc = '默认打包所有,加入app,则只打包app目录的,noapp则不打包app目录的';
exports.register = function(commander){
    commander
        .option('-e, --verbose', '输出构建日志', Boolean, false)
        .option('-c, --complete', '完整打包', Boolean, false)
        .option('-f, --force', '强制覆盖远程的里程碑', Boolean, false)
        .option('-a, --auto', '自动将当前分支合并到对应分支', Boolean, false)
        .option('-p, --app' , '只打包app目录的代码', Boolean, false)
        .option('-n, --noapp', '只打包非app即非构建的代码', Boolean,false)
        .option('-q, --quick', '快速', Boolean,false)
        .option('-t,--tag [type]','打包指定的两个tag版本,如09284-09295',String)
        .action(function(arg0,Command){
        var root,
            gitRoot,
            isGitRoot,
            extraPath,
            packConfStr,
            packConf,
            timeoutT,
            cmdType,
            outputPath,
            logPath,
            diffFile,
            userName,
            destBr,
            //代码类型
            codeType = "app",
            version,
            command = Command||arg0;
        var UglifyJS = require('uglify-js');
        var CleanCss = require('clean-css');
        var hashTempPath = "./.hashTemp";
        var diffHashPath = "./.diffTemp";
        var exec = require('child_process').exec;
            doExec("git config --get user.name",function(err,stdout){
                userName = stdout;
                fis.log.notice("Hi! "+userName);
                fis.log.notice("正在打包,请稍候...");
                if(checkPath()){
                    return;
                }
                checkBranch(function(version,destBr){
                    initEnv();
                    getDiffFiles(destBr,function(){
                        var hasDoAppPack = /(app|weixin|wanle)\/.*\.((?!html|json)\S)+\b/g.exec(diffFile),
                            hasDoPcPack = /(pc|touch|module|EBooking)\/.*\b/ig.test(diffFile);
                        if(hasDoAppPack&& !command.noapp){
                            var _path = codeType;
                            if(fis.util.exists(extraPath+"output/"+_path)){
                                try{
                                    fis.util.del(extraPath+"output/"+_path);
                                }catch(e){
                                    fis.log.notice("删除output/"+_path+"目录失败");
                                    fis.log.notice("请检查你是否打开了该目录!");
                                    return;
                                }
                            }
                            packApp(_path,version,destBr,function(){
                                if(hasDoPcPack){
                                    packPC(function(){
                                        collectAppRes(_path,function(){
                                            startUpload();
                                        });
                                    });
                                }else{
                                    collectAppRes(_path,function(){
                                        startUpload();
                                    });
                                }

                            });
                        }else{
                            if(hasDoPcPack){
                                packPC(function(){
                                    startUpload();
                                });
                            }
                        }
                    })

                })
            })
            function getTimestamp(isMore){
                var D = new Date(),
                    _m = D.getMonth()+ 1,
                    month = _m>9?_m: "0"+_m,
                    _d = D.getDate(),
                    date = _d>9?_d: "0"+_d,
                    _date =""+ (month)+""+ date  +Math.ceil(D.getHours()/4);
                if(isMore){
                    _date = ""+(month)+ date + D.getHours()+ D.getMinutes()+"_"+(userName||"");
                }
                return _date;
            }
        function createTag(callback){
            var timeStamp = getTimestamp();
            fis.log.notice("正在创建里程碑: "+("publish/"+timeStamp).red);
            doExec("git tag -l -n publish/"+timeStamp,function(err,output){
                var extraParam = "";
                if(output !== ""){
                    var createUser = output.match(/\s+(.*)\s$/)[1];
                    fis.log.notice("当前里程碑"+("publish/"+timeStamp).red+"已经存在!");
                    fis.log.notice("即当前时间里已经有人构建过:"+ createUser.red);
                    if(!(command.force||command.auto)){
                        fis.log.notice("如果需要覆盖对应的里程碑,请使用 tch pack -f");
                        return;
                    }else{
                        fis.log.notice("正在覆盖对应的里程碑");
                        extraParam = " -f";
                    }

                }
                doExec("git tag publish/"+timeStamp +" "+extraParam+" -m '"+userName+"'",function(err){
                    doExec("git push "+ extraParam +" origin publish/"+timeStamp,function(err){
                        if(err){
                            callback.call(this);
                            return;
                        }
                        fis.log.notice("成功创建里程碑,继续构建!");
                        callback.call(this);
                    })
                })
            })

        }
        function mergeBr(destBr,srcBr,callback){
            doExec("git checkout "+destBr,function(){
                doExec("git pull origin "+destBr,function(){
                    doExec("git merge "+ srcBr,function(err){
                        doExec("git status -s",function(err,stdout){
                            if(stdout){
                                //console.log(stdout);
                                fis.log.notice("发现下面几个文件存在冲突,请解决:")
                                var statusArr = stdout.split("\n"),
                                    msg = "";
                                for(var i = 0, len = statusArr.length -1; i<=len; i++){
                                    var exeArr = /UU\s(\S+)/.exec(statusArr[i]);
                                    if(exeArr){
                                        fis.log.notice(exeArr[1]);
                                    }
                                }
                                return;
                            }
                            doExec("git push origin "+ destBr,function(){
                                callback.call(this);
                            });
                        })
                    })
                })

            });
        }
        function checkBranch(callback){
            fis.log.notice("正在检测分支,请稍候...");
            doExec("git status -sb",function(err,stdout,stderr,cb){
                var statusArr = stdout.split("\n"),
                    branchArr = /##\s((daily|weixin|wanle)\/(\d+\.\d+\.\d+))/.exec(statusArr[0]),
                    devBrArr = /##\s((weixin|wanle)\/develop|develop)/.exec(statusArr[0]);
                //如果没有代码未提交,则会有两行,第一行为分支信息,第二行为空行
                if(statusArr.length >=3){
                    fis.log.notice("当前分支还有代码未提交,请提交后再进行操作!");
                    return;
                }
                if(typeof arg0 === "string"){
                    cmdType = arg0;
                }
                if(branchArr && branchArr[1] && branchArr[3]||command.tag){
                    destBr = branchArr[1];
                    version = branchArr[3];
                    var realpath = fis.util.realpath("./");
                    codeType = realpath.split("/").slice(-1)[0];
                    //如果是daily,则是打包app,否则是打包对应的目录,比如weixin,wanle等
                    //if(branchArr[2] !== "daily"){
                    //    codeType = branchArr[2];
                    //}
                    if(command.verbose){
                        fis.log.notice("检测到当前目录为"+(codeType+"").red+",正在打包");
                        fis.log.notice("分支名称为:"+destBr);
                    }
                    if(!cmdType){
                        cmdType = "publish";
                        fis.log.notice("当前分支为:"+destBr+",默认开启 publish");
                    }
                    if(cmdType !== "publish"){
                        fis.log.notice("发现当前分支为"+destBr.red+",构建命令为 tch pack "+"daily".red);
                    }
                }else if(devBrArr &&　devBrArr[1]){
                    var realpath = fis.util.realpath("./");
                    codeType = realpath.split("/").slice(-1)[0];
                    destBr = devBrArr[1];
                    version = "0.0.0";
                    if(!cmdType){
                        cmdType = "daily";
                        fis.log.notice("当前分支为:"+destBr+",默认开启 daily");
                    }
                    if(cmdType !== "daily"){
                        fis.log.notice("发现当前分支为 "+destBr+" 但构建命令为 tch pack "+"publish".red);
                        fis.log.notice("打包中止");
                        return;
                    }
                }else{
                    destBr = /##\s(\S+)/.exec(statusArr[0])[1];
                    if(command.auto && cmdType === "daily"){
                        fis.log.notice("检测到自动模式,正在进行合并到develop,请稍候...");
                        mergeBr("develop",destBr,function(){
                            destBr = "develop";
                            version="0.0.0";
                            callback && callback.call(this,version,destBr);
                        });
                        return;
                    }else{
                        fis.log.notice("当前分支不为"+"develop".red+"或"+"daily/a.b.c"+"或"+"weixin/develop");
                        fis.log.notice("打包中止");
                        return;
                    }
                }
                if(!destBr){
                    fis.log.notice("没有获取到分支名称");
                    return;
                }
                doExec("git fetch -p",function(_err){
                    doExec("git diff --name-only origin/"+destBr+" "+destBr,function(err,output){
                        if(err) return;
                        if(output.length > 3){
                            fis.log.notice("发现有未推送的代码,正在推送...");
                            doExec("git pull origin "+destBr,function(__err){
                                if(__err) return;
                                doExec("git push origin "+destBr,function(___err){
                                    if(___err) return;
                                    _callback();
                                })
                            })

                            return;
                        }
                        function _callback(){
                            if(cmdType === "publish"){
                                createTag(function(){
                                    callback && callback.call(this,version,destBr);
                                });
                            }else{
                                callback && callback.call(this,version,destBr);
                            }
                        }
                        _callback();
                    })


                })
            });
        }
        function getDiffFiles(branch,callback) {
            var self = this;
            if (diffFile) {
                callback.call(self, diffFile);
                return;
            }
            if (command.complete) {
                fis.log.notice("正在全量打包...");
                diffFile = fis.util.find("../").join("\n");
                callback.call(self, diffFile);
                return;
            }
            if(command.tag){
                var tagArr = /(\d{5,6})-(\d{5,6})/.exec(command.tag);
                if(tagArr){
                    tagArr[1] = "publish/"+tagArr[1];
                    tagArr[2] = "publish/"+tagArr[2];
                }else{
                    //检测是否是md5戳
                    tagArr = /([\w\d]{8,})-([\w\d]{8,})/i.exec(command.tag);
                    if(!tagArr){
                        fis.log.notice("请使用里程碑方式,如tch pack -t 09284-09295");
                        fis.log.notice("或使用md5对比方式,md5不少于8位,如tch pack -t dee565c88870-c80e6f41c51a2562a7fb9");
                        return;
                    }
                }
                exec("git diff --name-only "+tagArr[1]+" " + tagArr[2],
                    function (err, stdout, stderr, cb) {
                        if (command.verbose) {
                            fis.log.notice("跟master对比,有改动的文件有:");
                            fis.log.notice(stdout);
                        }
                        diffFile = stdout;
                        callback.call(self, diffFile);
                    });
                return;
            }
            exec("git diff --name-only refs/remotes/origin/master refs/remotes/origin/" + branch,
                function (err, stdout, stderr, cb) {
                if (command.verbose) {
                    fis.log.notice("跟master对比,有改动的文件有:");
                    fis.log.notice(stdout);
                }
                diffFile = stdout;
                callback.call(self, diffFile);
            })
        }
        function getLatestTag(){
            doExec("git tag",function(err,stdout,stderr){
                if(stdout){
                    var tagList = stdout.split("\n"),
                        tagLen = tagList.length;
                }
            });
        }
        function packApp(_type,version,destBr,callback){
            fis.log.notice("正在打包"+_type+"目录,请稍候...");
            doExec("git status -sb",function(err,stdout,stderr,cb){
                if(fis.util.exists(diffHashPath)){
                    fis.util.del(diffHashPath);
                }
                if(fis.util.exists(hashTempPath)){
                    fis.util.del(hashTempPath);
                }
                if(command.quick){
                    doExec("git checkout "+destBr+" && git pull origin "+destBr,function(){
                        var releaseCmd = "tch release "+cmdType;
                        doExec(releaseCmd,function(){
                            fis.log.notice("构建完成,开始执行复制!");
                            callback && callback.call(this);
                        })
                    })
                    return;
                }
                doExec("git checkout master && git pull origin master",function(err,stdout,stderr,cb){
                    var releaseCmd = "tch release "+cmdType +" -v "+version;
                    doExec(releaseCmd,function(err,stdout,stderr,cb){
                        doExec("git checkout "+destBr+" && git pull origin "+destBr,function(){
                            var releaseCmd = "tch release "+cmdType;
                            doExec(releaseCmd,function(){
                                fis.log.notice("构建完成,开始执行复制!");
                                callback && callback.call(this);
                            })
                        })
                    })
                })
            })
        }

        function copyAppFile(arr,appConf,callback){
            var self = this;
            if(arr.length <1) {
                callback.call(self);
                return;
            }
            var args = arguments;
            var item = arr.pop();
            var prefix = "../output/"+codeType;
            var appConfItem;
            if(!appConf){
                fis.log.notice("没有配置打包配置!");
                return;
            }
            var isNoMatch = false;
            for(var n = 0, nLen = appConf.length -1; n<=nLen; n++){
                appConfItem = appConf[n];
                if(appConfItem.reg.test(item)){
                    isNoMatch = true;
                    var execArr = appConfItem.reg.exec(item),
                        toStr = appConfItem.to,
                        toPath = toStr[cmdType].replace(/\$(\d+)/g,function($0,$1){
                            return execArr[$1];
                        });
                    fis.util.copy(prefix+item,extraPath+toPath);
                    writeLog(item);
                    if(command.verbose){
                        fis.log.notice("正在复制: "+(prefix+item));
                    }
                    process.nextTick(function(){
                        copyAppFile.apply(self,args);
                    });
                    break;
                }
            }
            if(!isNoMatch){
                process.nextTick(function(){
                    copyAppFile.apply(self,args);
                });
            }
        }
        function collectAppRes(type,callback){
            if(fis.util.exists(diffHashPath)){
                var diffTemp = fis.util.readJSON(diffHashPath),
                    url,
                    appConf = packConf.pack[(type||"app")+"Path"],
                    appConfItem;
                if(diffTemp.length >0){
                    if(command.verbose){
                        fis.log.notice("app目录的diff差异: ");
                        fis.log.notice(diffTemp);
                    }
                    for(var i = 0,len = diffTemp.length -1; i<=len; i++){
                        var extraUrl = diffTemp[i].replace(/\/(\w+s)\/tc_.*\.(\w+s)$/,function($0,$1,$2){
                            var ext = $1 === "js" ?"css":"js";
                            return $0.replace($1,ext).replace($2,ext);
                        })
                        if(diffTemp.indexOf(extraUrl)===-1){
                            diffTemp.push(extraUrl);
                        }
                    }
                    fis.log.notice("正在复制"+codeType+"目录里的文件到"+cmdType);
                    copyAppFile(diffTemp,appConf,callback);
                }else{
                    callback.call(this);
                }
            }else{
                callback.call(this);
            }
        }
        function packPC(callback){
            if(!callback) callback = function(){};
            process.on('uncaughtException', function (err) {
                if(command.verbose){
                    console.log(err);
                }
            });
            getDiffFiles(destBr,function(fileOutput){
                var fileArr = fileOutput.split("\n");
                for(var i = 0, len = fileArr.length -1; i<=len; i++){
                    var filePath = fileArr[i];
                    if(filePath) {
                        var matchArr = _match(filePath, version,callback);
                    }
                }
            })
        }
        function doExec(cmd,callback){
            if(command.verbose){
                fis.log.notice("开始执行:"+cmd);
            }
            exec(cmd,function(){
                var args = arguments;
                if(command.verbose){
                    fis.log.notice("执行完成:"+cmd);
                }
                if(args && args[0]){
                    fis.log.notice(args[0]);
                }
                callback && callback.apply(this,args);
            });
        }
        function checkPath(){
            setProjectRoot();
            root =  fis.project.getProjectPath();
            isGitRoot = fis.util.isDir("./.git"),
                extraPath = isGitRoot?"":"../";
            if(!gitRoot){
                if(isGitRoot){
                    fis.log.notice("打包的目录不对,请进入app或者weixin进行打包!");
                    return true;
                    gitRoot = fis.util.realpath("./");
                }else{
                    gitRoot = fis.util.realpath(root+"/"+extraPath);
                }
            }
        }
        function initEnv(){
            outputPath = extraPath+ "output/"+cmdType;
            logPath = outputPath+"/path.log";
            //删除生成文件夹
            try{
                fis.util.del(outputPath);
            }catch(e){
                fis.log.notice("无法删除output目录,如果该目录被打开,则无法被删除!");
                fis.log.notice(e);
                return;
            }
            var packConfPath = gitRoot+"/pack.json";
            if(fis.util.exists(packConfPath)){
                packConfStr = fis.util.read(packConfPath),
                packConf = eval('('+packConfStr+')');
            }else{
                fis.log.notice("pack.json打包配置不存在!");
            }

        }
        function _match(filePath,version,callback){
            var arr = packConf.pack.roadpath;
            var isBreak = false;
            for(var i = 0, len = arr.length -1; i<=len; i++){
                var regArr = arr[i].reg,
                    regX;
                if(typeof regArr !== "array"){
                    regArr = [regArr];
                }

                for(var n = 0, nLen = regArr.length -1; n<=nLen; n++){
                    var regItem = regArr[n];
                    if(typeof regItem === "string"){
                        regX = new RegExp(regArr[n]);
                    }else{
                        regX = regItem;
                    }
                    if(regX.test(filePath)){
                        if(filePath.indexOf(":")>-1){
                            var _pre = fis.util.realpath("../");
                            filePath = filePath.replace(_pre,"");
                        }
                        if(!fis.util.exists(extraPath+filePath)){
                            continue;
                        }
                        var from = arr[i].from,
                            _date = getNewDate(filePath);
                        isBreak = true;
                        if(from){
                            lookup(from,{
                                version: version,
                                date: _date
                            },callback);
                        }else{
                            lookup([filePath],{
                                date: _date,
                                version: version
                            },callback);
                        }

                        break;
                    }
                }
                if(isBreak){
                    break;
                }
            }
            return arr;
        }
        function getNewDate(filePath){
            var _file = fis.file.wrap(extraPath+filePath),
                _hash = _file.getHash();

            var hashData = getHash()[filePath];
            if(hashData && hashData.hash === _hash){
                return hashData.date;
            }
            var cfg = {},
                _date = getTimestamp();
            cfg[filePath] = {
                date: _date,
                hash: _hash
            };
            saveHash(cfg);
            return _date;
        }
        function getHash(){
            var tempHashConf = root+"/tempHash.json";
            var isExists = fis.util.exists(tempHashConf),
                tempHashContent = isExists? fis.util.read(tempHashConf):"{}",
                tempHashData = JSON.parse(tempHashContent);
            return {
                path: tempHashConf,
                data:tempHashData
            };
        }
        function saveHash(cfg){
            var tempHashJson = getHash(),
                tempHashData = tempHashJson.data;
            tempHashData = fis.util.merge(tempHashData,cfg);
            fis.util.write(tempHashJson.path,JSON.stringify(tempHashData));
        }
        function uploadFunc(itemCfg,path){
            var ftpCfg;
            if(!itemCfg.length){
                fis.log.notice('全部上传成功!');
                return;
            }else{
                ftpCfg = itemCfg.shift();
            }
            var FtpDeploy = require('./lib/ftp-deploy'),
                config = ftpCfg.server;
            config.localRoot = path;
            if(cmdType === "publish"){
                config.remoteRoot= ftpCfg.to+"/"+getTimestamp();
            }else{
                config.remoteRoot= ftpCfg.to;
            }

            var ftpDeploy = new FtpDeploy();
            ftpDeploy.on('upload-error', function (data) {
                console.log(data.err); // data will also include filename, relativePath, and other goodies
            });
            ftpDeploy.deploy(config, function(err) {
                if (err) {
                    fis.log.error(err);
                }
                else {
                    fis.log.notice('一台服务器已上传!');
                    uploadFunc(itemCfg,path);
                }
            });
        }
        function startUpload(){
            fis.log.notice('正在上传,请稍候...');
            var output = "../output/"+cmdType;
            var merge = require("merge");
            var path = fis.util.realpath(output);
            var extraFile = fis.util.read("./extra.json"),
                extraData = JSON.parse(extraFile);
            var ftpCfg,config;
                ftpCfg = extraData.ftp[cmdType];
            if(!ftpCfg){
                var ftpFileConf = fis.util.read("./ftpTemp.json");
                if(!ftpFileConf){
                    fis.log.notice("没有配置ftp的publish账号,请手动上传!");
                    return;
                }
                ftpCfg = JSON.parse(ftpFileConf).publish;
            }
            if(!ftpCfg.length){
                ftpCfg = [ftpCfg];
            }
            uploadFunc(ftpCfg,path);
            try{
                bakFiles();
            }catch(e){
                fis.log.notice("备份打包源码失败!");
            }
        }
            function uploadFile(buffer,subpath){
                var receiver = "http://10.14.84.206:8080";
                if(typeof buffer === "string"){
                    buffer = fis.util.read(buffer);
                }
                fis.util.upload(
                    //url, request options, post data, file
                    receiver, null, {}, buffer, subpath,
                    function(err, res){
                        if(err && err != 302){
                            fis.log.error('upload file [' + subpath + '] to [' + to +
                                '] by receiver [' + receiver + '] error [' + (err || res) + ']');
                        } else {
                            var time = '[' + fis.log.now(true) + ']';
                            process.stdout.write(
                                ' - '.green.bold +
                                time.grey + ' ' +
                                subpath.replace(/^\//, '') +
                                ' >> '.yellow.bold +
                                to +
                                '\n'
                            );
                        }
                    }
                );
            }
        function bakFiles(){
            var zipdir = require('zip-dir');
            var subpath;
            var to = subpath = getTimestamp(true)+'.zip',
                uploadPath = outputPath+'/../upload/';
            if(!fis.util.isDir(uploadPath)){
                fis.util.mkdir(uploadPath);
            }
            zipdir(outputPath,{ saveTo: uploadPath +subpath }, function (err, buffer) {
                if(!err){
                    var files = fis.util.find(uploadPath);
                    files.forEach(function(n){
                        uploadFile(n,subpath);
                    });
                }
            });
        };
        //检查危险代码
        function checkDanger(_file){
            var fileContent = _file.minContent||_file.getContent(),
                dangerConf = packConf && packConf.pack.danger,
                dangerExclude = dangerConf.exclude,
                dangerMatch = fileContent.match(dangerConf.reg);
            if(dangerMatch){
                var flag = true;
                if(dangerExclude){
                    var fullFileName = _file.realpath;
                    dangerExclude.forEach(function(n,i){
                        if(fullFileName.indexOf(n)>-1){
                            flag = false;
                            return;
                        }
                    })
                }
                if(!flag){
                    return;
                }
                fis.log.notice(_file+"包含危险字段:"+(dangerMatch.join(",")).red);
                if(_file.indexOf("html")>-1){
                    return;
                }else{
                    return true;
                }
            }
        }
        function lookup(fromArr,cfg,callback){
            var packArr = packConf.pack.roadpath;
            var type = cmdType||"publish";
            var isGitRoot = fis.util.isDir("./.git"),
                extraPath = isGitRoot?"":"../";
            for(var n = 0, nLen = fromArr.length -1; n<=nLen; n++){
                var from = fromArr[n];
                for(var i = 0, len = packArr.length -1; i<=len; i++){
                    var packItem = packArr[i],
                        regStr = packItem.reg,
                        toStr = packItem.to[type],
                        domainObj = packItem.domain,
                        domainStr = domainObj && domainObj[type],
                        regX;
                    if(typeof regStr === "string"){
                        regX = new RegExp(regStr);
                    }else{
                        regX = regStr;
                    }
                    if(regX.test(from)){
                        var url = from.replace(regX,domainStr).replace(/{{(\w+)}}/g,function($0,$1){
                            return cfg[$1];
                        });
                        var fromStr = from.replace(regStr,function($0,$1,$2,$3){
                                packItem["$1"] = $1;
                                packItem["$2"] = $2;
                                packItem["$3"] = $3;
                                return toStr;
                            }),
                            fromPath = from.replace(/{{(\w+)}}/g,function($0,$1){
                                return cfg[$1];
                            });
                        var toPath = fromStr.replace(/{{(\w+)}}/g,function($0,$1){
                            return cfg[$1];
                        }).replace("$1",packItem["$1"]).replace("$2",packItem["$2"]).replace("$3",packItem["$3"]);
                        var _file = fis.file.wrap(extraPath+fromPath),
                            hash = _file.getHash();
                        var fileContent = _file.getContent();
                        if(_file._isText){
                            //压缩文本
                            zipResource(_file);
                            if(cmdType === "publish" && checkDanger(_file)){
                                global.isError = true;
                            }
                            fileContent = fileContent.replace(/url\((\\?['"]?)([^)]+?)\1\)|<link[^>]+href=(\\?['"]?)([^'"]+)\3|\ssrc=(\\?['"]?)([^'"]+)\5/g,function($0,$_1,$1,$_2,$2,$_3,$3){
                                var value = $2||$4||$6,
                                    filePath = _file.dirname+"/"+value,
                                    localFilePath = fis.util.realpath(filePath);
                                if(!localFilePath){
                                    if(filePath.indexOf("http")>-1){
                                        return $0;
                                    }else{
                                        if(_file.realpath.indexOf("#")===-1 &&
                                            _file.realpath.indexOf(":")===-1
                                        ){
                                            fis.log.warning(_file.realpath.bold.red+"存在问题:")
                                            fis.log.warning($2.bold.red+"不存在!");
                                        }
                                    }
                                    return $0;
                                }
                                var url = "";
                                for(var n = 0, nLen = packArr.length -1; n<=nLen;n++){
                                    var _packItem = packArr[n],
                                        _regX = _packItem.reg;
                                    if(_regX.test(localFilePath)){
                                        url = localFilePath.replace(_regX,_packItem.domain[type])
                                            .replace("$1",packItem["$1"])
                                            .replace("$2",packItem["$2"])
                                            .replace("$3",packItem["$3"])
                                            .replace(gitRoot+"/","")
                                            .replace(/{{(\w+)}}/g,function($0,$1){
                                                return cfg[$1];
                                            });
                                        break;
                                    }
                                }
                                return $0.replace(value,url);
                            });
                        }
                        var _path = extraPath+toPath;
                        if(_file._isText){
                            if(cmdType === "daily"){
                                fis.util.write(_path,fileContent);
                            }else{
                                fis.util.write(_path,_file.minContent||fileContent);
                            }
                            fis.util.write(_path.replace(/\.(\w+)$/,".pkg.$1"),fileContent);
                        }else{
                            fis.util.write(_path,fileContent);
                        }

                        if(from.indexOf("img") === -1||_file.ext === ".html"){
                            if(command.verbose){
                                fis.log.notice("源文件:"+from);
                                fis.log.notice("打包后的地址为:"+url);
                            }

                            if(timeoutT){
                                clearTimeout(timeoutT);
                            }
                            timeoutT = setTimeout(function(){
                                if(global.isError){
                                    fis.log.notice("打包出现问题,中断!");
                                    return;
                                }
                                fis.log.notice("打包时间戳为:"+getTimestamp().red);
                                fis.log.notice("打包的更多详细内容已经输出到以下文件里:");
                                fis.log.notice(fis.util.realpath(logPath));
                                callback.call(this);
                            },300);
                            writeLog(from,url);
                        }
                        break;
                    }
                }
            }
        }
        function zipResource(file){
            var content = file.getContent(),
                ret;
            if(file.ext === ".js"){
                ret = UglifyJS.minify(content, {fromString: true}).code;
            }else if(file.ext === ".css"){
                ret = new CleanCss().minify(content).styles
            }
            file.minContent = ret;
        }
        function writeLog(from,url){
            var srcLine = "源文件:"+from,
                destLine = url?"打包后的地址为:"+url +"\r\n":"";
            var isExistLog = fis.util.isFile(logPath),
                content = srcLine+"\r\n"+destLine+"\r\n";
            if(isExistLog){
                content += fis.util.read(logPath);
            }
            fis.util.write(logPath,content);
        }
        function setProjectRoot(){
            var thisPath = fis.util.realpath(process.cwd()),
                filename = "tch-conf.js",
                confFilePath = thisPath+"/"+filename,
                cwd = thisPath,pos = cwd.length;
            do {
                cwd  = cwd.substring(0, pos);
                if(fis.util.exists(confFilePath)){
                    root = cwd;
                    break;
                } else {
                    confFilePath = false;
                    pos = cwd.lastIndexOf('/');
                }
            } while(pos > 0);
            if(!root){
                root = thisPath+"/app";
            }
            fis.project.setProjectRoot(root);
        }
    });
}
exports.commands = function(){
    var opts = {
        "publish": {
            "desc": "打包改动的代码并替换为正式线上的路径"
        },
        "daily":{
            "desc": "打包改动的代码并替换为测试线上的路径"
        }
    };
    return opts;
}