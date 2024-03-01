[![Review Assignment Due Date](https://classroom.github.com/assets/deadline-readme-button-24ddc0f5d75046c5622901739e7c5dd533143b0c8e959d652212380cedb1ea36.svg)](https://classroom.github.com/a/7vwLpaEp)
# Exam Call 2

The structure of this repository is the following:
  - "NodeClient" contains the node.js ToDoManager service application, which works as a gRPC client (including documentation for REST APIs and JSON schemas);
  - "JavaServer" contains the Java Converter service application, which works as a gRPC server.

### Project structure
The following schema is a general overview of the project structure that includes the main files/folders of the project: 


    .
    ├── ...
    ├── JavaServer                    
    │   ├── src\main        
    |       ├── java                              # Java source code
    |           ├── Conversion.java               # Code of the Conversion Service
    |           └── ConversionServer.java         # Code of the Java Server
    |       ├── proto                             # Contains the conversion.proto file
    |   ├── acceptable_parameters.txt             # Configuration for the conversion service (<input/output>, <maxsize>)
    |   ├── pom.xml
    │   └── ...               
    └── NodeClient
        ├── api                                   # Contains the .json and .yaml OpenAPI files
        ├── proto                                 # Contains the conversion.proto file
        ├── uploads                               # Where the images are uploaded
        ├── congfiguration                        # Configuration for the conversion service (<input/output>, <maxsize>)
        ├── index.js                              # NodeJS server
        └── DSP-2nd-call.postman_collection.json
    

### Prerequisites

### Installation & Usage

#### gRPC server: JavaServer folder
1. Open the project in Eclipse 
2. Perform a "Maven -> Update Project" in Eclipse to synchronize the project configuration 
3. Run the ConversionServer as a Java Application 

If the ConversionServer is properly run it should output: 
- Listening on port 50051

__Note__ : If the server does not start it could be that the port is undergoing some conflicts, simply stop any running istances of the server and restart it.

#### gRPC client: NodeClient folder
1. From inside the NodeClient folder, run `npm install`
2. Then, run `npm start`

__Note__ : At this point the registration and negotiation of parameters should start and regardless of the outcome of them NodeJS server will start (implementation choice later explained).

If the registration succeded output should look like this: 
- Registration Successful, starting the server...
- Your server is listening on port %d (http://localhost:%d)
- Swagger-ui is available on http://localhost:%d/docs


#### Postman: REST API client
The NodeClient folder includes a Postman collection that can be used to experiment the functionalities implemented in this project.
1. Open Postman
2. Click on Collections
3. Click on Import button and select the collection provided here in the repository `DSP-2nd-call.postman_collection.json`

__Note__ : running the "Login" is strictly necessary as otherwise all requests will be unauthorized 

### Design choices
In this section, there are a list of design choices I made with a brief explanation.
    
1. In case of registration failure, the server proceeds to start as other services unrelated to the registration process, such as fetching a list of films, remain accessible without requiring a negotiated ID or parameters.

2. Upon encountering a registration failure, the Node client will retry the registration just before initiating any conversion requests. Only after successfully registering it can proceed with conversion attempts.

3. If the gRPC server crashes and later restarts, the Node client may still believe it is registered. However, upon encountering a "NOT_REGISTERED_ID" error during a conversion attempt, the Node client automatically initiates a registration process followed by the conversion request.
