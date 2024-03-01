'use strict';

const db = require('../components/db');
const Image = require('../components/image');

const PROTO_PATH = __dirname + '/../proto/conversion.proto';
const REMOTE_URL = "localhost:50051";
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
var fs = require('fs');
var path = require('path') ; 
const { register } = require('../controllers/ImagesController');

let packageDefinition = protoLoader.loadSync(
    PROTO_PATH,
    {keepCase: true,
     longs: String,
     enums: String,
     defaults: true,
     oneofs: true
    });
let vs = grpc.loadPackageDefinition(packageDefinition).conversion;
let client = new vs.Converter(REMOTE_URL, grpc.credentials.createInsecure());
let negotiated = [] ; 
let registered = false ;
let clientId = "" ; 
let internal_params = [] ; 

/**
 * Add a new image to the film
 *
 **/
exports.addImage = function(filmId, file, owner) {
    return new Promise((resolve, reject) => {

        const sql1 = "SELECT owner FROM films f WHERE f.id = ? AND f.private = 0";
        db.all(sql1, [filmId], (err, rows) => {
            if (err)
                reject(err);
            else if (rows.length === 0)
                reject(404);
            else if(owner != rows[0].owner) {
                reject(403);
            }
            else {

                var nameFile = file.filename;
                var nameWithoutExtension = nameFile.substring(0, nameFile.lastIndexOf(".") );
                var extension = nameFile.substring(nameFile.lastIndexOf(".")).replace('.', '');
                if(extension != 'jpg' && extension != 'png' && extension != 'gif'){
                    reject(415);
                    return;
                }

                // SQL query for the creation of the image
                const sql2 = 'INSERT INTO images(name) VALUES(?)';
                db.run(sql2, [nameWithoutExtension], function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        var imageId = this.lastID;
                        var imageInstance = new Image(imageId, filmId, nameWithoutExtension);
                        // SQL query to associate the image to the film
                        const sql3 = 'INSERT INTO filmImages(filmId, imageId) VALUES(?, ?)';
                        db.run(sql3, [filmId, imageId], function(err) {
                            if (err) {
                            reject(err);
                            } else {
                            resolve(imageInstance);
                            }
                        });
                    }
                });



            }
        });  
    });
  }

/**
 * Retrieve the images associated to the film with ID filmId
 *
 **/
exports.getImages = function(filmId, owner) {
    return new Promise((resolve, reject) => {

        const sql1 = "SELECT f.owner as owner, r.reviewerId as reviewer FROM films f, reviews r WHERE f.id = ? AND f.private = 0 AND f.id = r.filmId";
        db.all(sql1, [filmId], (err, rows) => {
            if (err)
                reject(err);
            else if (rows.length === 0)
                reject(404);
            else {

                var forbidden = true;
                for (var i = 0; i < rows.length; i++) {
                    if(owner == rows[i].owner || owner == rows[i].reviewer){
                        forbidden = false;
                    }
                }

                if(forbidden){
                    reject(403);
                }
                else
                {
                    const sql2 = 'SELECT imageId, name FROM images as i, filmImages as f WHERE i.id = f.imageId AND f.filmId = ?';
                    db.all(sql2, [filmId], function(err, rows) {
                        if (err)
                            reject(err);
                        else {
                            let images = rows.map((row) => new Image(row.imageId, filmId, row.name));
                            resolve(images);
                        }
                    });
                }
            }
        }); 
    });
  }

  
/**
 * Retrieve an image data structure
 *
 **/
exports.getSingleImage = function(imageId, imageType, filmId, owner) {
    return new Promise((resolve, reject) => {

        const sql1 = "SELECT f.owner as owner, r.reviewerId as reviewer FROM films f, reviews r WHERE f.id = ? AND f.private = 0 AND f.id = r.filmId";
        db.all(sql1, [filmId], (err, rows) => {
            if (err)
                reject(err);
            else if (rows.length === 0)
                reject(404);
            else {

                var forbidden = true;
                for (var i = 0; i < rows.length; i++) {
                    if(owner == rows[i].owner || owner == rows[i].reviewer){
                        forbidden = false;
                    }
                }

                if(forbidden){
                    reject(403);
                }
                else
                {
                    // SQL query for retrieving the imageName and finding if the image exists for that film
                    const sql2 = 'SELECT name FROM images as i, filmImages as f WHERE i.id = f.imageId AND i.id = ? AND f.filmId = ?';
                    db.all(sql2, [imageId, filmId], async function(err, rows) {
                        if (err)
                            reject(err);
                        else if (rows.length === 0)
                            resolve(404);
                        else {
                            //CASE 1: application/json
                            if(imageType == 'json'){
                                var imageInstance = new Image(imageId, filmId, rows[0].name);
                                resolve(imageInstance);
                            }
                            //Case 2: image/png, image/jpg, image/gif
                            else {
                                var nameNoExtension = rows[0].name;
                                
                                //add the extension
                                var nameFile = nameNoExtension + '.' + imageType;
                                var pathFile = __dirname + '/../uploads/' + nameFile;
                                
                                //check if there is a file saved with the requested media type
                                try {
                                    if (fs.existsSync(pathFile)) {
                                        //send the file back
                                        resolve(nameFile);
                                    }  
                                    else {
                                        //otherwise, I must convert the file
                                        //I search for a file, with a different extension, saved server-side
                                        var imageType2, imageType3;
                                        if(imageType == 'png'){
                                            imageType2 = 'jpg';
                                            imageType3 = 'gif'
                                        } else if(imageType == 'jpg'){
                                            imageType2 = 'png';
                                            imageType3 = 'gif'
                                        } else if(imageType == 'gif'){
                                            imageType2 = 'jpg';
                                            imageType3 = 'png'
                                        } 
        
                                        var pathFile2 = './uploads/' + nameNoExtension + '.' + imageType2;
                                        var pathFile3 = './uploads/' + nameNoExtension + '.' + imageType3;
                                        var pathOriginFile = null;
                                        var originType = null;
                                        var pathTargetFile = './uploads/' + nameFile;
                                        
                                        try {
                                            if (fs.existsSync(pathFile2)) {
                                                pathOriginFile = pathFile2;
                                                originType = imageType2;
                                            } else if(fs.existsSync(pathFile3)){
                                                pathOriginFile = pathFile3;
                                                originType = imageType3;
                                            }
                                        } catch(err) {
                                            reject(err);
                                        }
        
                                        if(pathOriginFile == null){
                                            resolve(404);
                                        }
        
                                        await convertImage(pathOriginFile, pathTargetFile, originType, imageType);
                                        resolve(nameFile);
                                    }
                                } catch(err) {
                                    reject(err);
                                }
                            }
                        }
                    });
                }
            }
        }); 
    });
 }




  /**
 * Delete an image from the film
 *
 **/
  exports.deleteSingleImage = function(filmId, imageId, owner) {
    return new Promise((resolve, reject) => {


        const sql1 = "SELECT owner FROM films f WHERE f.id = ? AND f.private = 0";
        db.all(sql1, [filmId], (err, rows) => {
            if (err)
                reject(err);
            else if (rows.length === 0)
                reject(404);
            else if(owner != rows[0].owner) {
                reject(403);
            }
            else {
                //I retrieve the image name
                const sql2 = 'SELECT name FROM images WHERE id = ?';
                db.all(sql2, [imageId], (err, rows) => {
                    if(err)
                        reject(err);
                    else if (rows.length === 0)
                        reject(404);
                    else {
                        var nameNoExtension = rows[0].name;
                        //DELETE
                        //firstly, I delete the relationship with the film 
                        const sql3 = 'DELETE FROM filmImages WHERE filmId = ? AND imageId = ?';
                        db.run(sql3, [filmId, imageId], (err) => {
                            if (err)
                                reject(err);
                            //secondly, I delete the image row from the database
                            else {
                                const sql4 = 'DELETE FROM images WHERE id = ?';
                                db.run(sql4, [imageId], (err) => {
                                    if (err)
                                        reject(err);
                                    //thirdly, I delete the images from the server
                                    else {
                                        var pathFile1 = './uploads/' + nameNoExtension + '.png';
                                        var pathFile2 = './uploads/' + nameNoExtension + '.jpg';
                                        var pathFile3 = './uploads/' + nameNoExtension + '.gif';
                                        if (fs.existsSync(pathFile1)) {
                                            fs.unlinkSync(pathFile1);
                                        }  
                                        if (fs.existsSync(pathFile2)) {
                                            fs.unlinkSync(pathFile2);
                                        }  
                                        if (fs.existsSync(pathFile3)) {
                                            fs.unlinkSync(pathFile3);
                                        }  

                                        resolve();
                                    }
                                });
                        }
                    });
                    }
                });
                
            }
        }); 

        
      });
  }

function typePermitted(type, dir){
    if(negotiated.length == 0 ){
        return false ; 
    }
    if(negotiated.findIndex((elem)=> elem.type == type.toUpperCase() && elem.dir == dir) == -1 ){
        return false ; 
    }
    return true ; 
}

const getFileSize = (filePath) => {
        // Get file stats synchronously
        console.log("checking file size"); 
        const stats = fs.statSync(filePath);
        // Return the file size in bytes
        return stats.size;
};


function convertImage(pathOriginFile, pathTargetFile, originType, targetType) {

    function continueConversion() {

    return new Promise((resolve, reject) => {
    
        if(!typePermitted(originType, "INPUT")|| !typePermitted(targetType, "OUTPUT")) {
            console.log("failed input type") ; 
            reject(400) ; // bad request
            return ;  
        }
        const sizePermitted = negotiated.find(param => param.dir === 'INPUT' && param.type === originType.toUpperCase()).max_size;
        try {
            const size = getFileSize(pathOriginFile)/1024 ; 
            if(size > sizePermitted && sizePermitted!= 0 ){
                reject("Internal error due to the input size");
                return ; 
            }
        }catch{
            console.log("failed input size") ; 
            reject(500);
            return ; 
        }


        // Open the gRPC call with the gRPC server
        let call = client.fileConvert();


        // Set callback to receive back the file
        var wstream = fs.createWriteStream(pathTargetFile); //for now, the name is predefined
        let exitStatus = "OK" ; 
        call.on('data', function(data){

            //receive meta data
            if(data.meta != undefined){
                exitStatus = data.meta.code; 
                if(exitStatus != "OK") {
                    fs.unlinkSync(pathTargetFile) ; 
                    reject(exitStatus) ; 
                }
            }

            //receive file chunck
            if(data.file != undefined){
                wstream.write(data.file);
            }

        });

        // Set callback to end the communication and close the write stream 
        call.on('end',function(){
            wstream.end();
        })
                    
        // Send the conversion types for the file (when the gRPC client is integrated with the server of Lab01, the file_type_origin and file_type_target will be chosen by the user)
        call.write({ "meta": {"file_type_origin": originType, "file_type_target": targetType, "id": clientId}});

        // Send the file
        const max_chunk_size = 1024; //1KB
        const imageDataStream = fs.createReadStream(pathOriginFile, {highWaterMark: max_chunk_size});
       
        imageDataStream.on('data', (chunk) => {
            call.write({"file": chunk });
        });

        // When all the chunks of the image have been sent, the clients stops to use the gRPC call from the sender side
        imageDataStream.on('end', () => {
            call.end();
        });

        // Only after the write stream is closed,the promise is resolved (otherwise race conditions might happen)
        wstream.on('close',function(){
            resolve();
        })
    });

}
return new Promise((resolve,reject) => {
    if(!registered) {
        console.log("not registered trying to register and again ") ; 
        exports.registerClient()
        .then((resp)=> {
            console.log("regsitration successful") ; 
           continueConversion().then((response) => resolve(response)).catch((err)=> {reject(err)}) 
        })
    }else {
       continueConversion()
       .then((r)=> resolve(r))
       .catch((err)=> {
        if (err == "NOT_REGISTERED_ID") {
            registered = false ; 
            negotiated = [] ; 
            console.log("id not valid") ; 
            exports.registerClient().then(()=> {continueConversion().then((resp)=> {resolve(resp)})}).catch((error)=>reject(error)) ; 
        }else{
            console.log("registered and the problem is not the id") ; 
            reject(err) ; 
        }
       })
    }
})
}
function readConfigFile(filePath) {
    // Read the configuration file
    try {
        const configData = fs.readFileSync(filePath, 'utf8');
        const lines = configData.split('\n');
        
        // Extract the client ID from the first line
        clientId = lines[0].trim();

        // Parse the rest of the lines to extract parameters
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line) { // Skip empty lines
                const [dir, type, max_size] = line.split(/\s+/);
                internal_params.push({ dir, type, max_size: parseInt(max_size) });
            }
        }
        return 1;
    } catch (err) {
        console.error('Error reading configuration file:', err);
        return null;
    }
}

exports.registerClient = function () {
    return new Promise((resolve, reject) => {
        if(readConfigFile(path.join(__dirname, "../configuration")) == null) {
            reject("Cannot register, missing params from configuration file") ; 
            return ; 
        } ; 
        // Prepare the registration request using the configuration data
        const request = {
            id: clientId, 
            params: internal_params 
        };

        // Call the registration endpoint on the server
        client.registration(request, (err, response) => {
            if (err) {
                reject(err); // Reject the promise if there's an error
            } else {
                if(response.code === "OK") {
                    negotiated = response.params ; 
                    registered = true ; 
                    resolve("registration correclty executed"); // Resolve the promise with the response from the server
                }else {
                    switch (response.code){
                        case "NEGOTIATION_FAILURE" : {
                            reject("Registration failed due to negotiation failure"); 
                            break ; 
                        }
                        case "ID_ALREADY_EXISTING" : {
                            reject("Registration failed due to the usage of an already existing Id"); 
                            break ; 
                        }
                        case "GENERIC_FAILURE" : {
                            reject("Registration failed due to an internal generic error"); 
                            break ; 
                        }
                        default :{
                            reject("Registration failed due to unknown motives")  ;   
                        }
                    }
                }
            }
        });
    })
};

exports.returnParams = function() {
    return new Promise((resolve,reject) => {
        if(negotiated == null || negotiated.length == 0) {
            reject("No negotiated params ") ; 
        }else {
            resolve(negotiated) ; 
        }

    })
}