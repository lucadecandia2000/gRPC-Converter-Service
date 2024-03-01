import conversion.*;
import io.grpc.stub.StreamObserver;
import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.FileReader;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.logging.Level;
import java.util.logging.Logger;
import javax.imageio.ImageIO;
import com.google.protobuf.ByteString;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.Transparency;
import java.awt.image.BufferedImage;

public final class Converter extends ConverterGrpc.ConverterImplBase {

	private static final Logger logger = Logger.getLogger(Converter.class.getName());
	private static ConcurrentHashMap<String,List<Parameter>> savedClients = new ConcurrentHashMap<>() ; 
	private static Map<String, Integer> acceptableParameters = new HashMap<>();
	
    static {
        // Load acceptable parameters from file
        loadAcceptableParametersFromFile("acceptable_parameters.txt");
    }

    private static void loadAcceptableParametersFromFile(String filePath) {
        try (BufferedReader reader = new BufferedReader(new FileReader(filePath))) {
            String line;
            while ((line = reader.readLine()) != null) {
                String[] parts = line.split(" ");
                if (parts.length == 3) {
                    String direction = parts[0];
                    String type = parts[1];
                    int maxSize = Integer.parseInt(parts[2]);
                    String key = direction + ":" + type;
                    acceptableParameters.put(key, maxSize);
                }
            }
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

	@Override
	public void registration(RegistrationRequest request, StreamObserver<RegistrationResponse> responseObserver) {
		// handle possible empty id 
		String id = request.getId() ; 
		List<Parameter> paramsList = request.getParamsList(); 
		
	    // Check if the ID already exists
	    if (savedClients.containsKey(id)) {
	        // ID already exists, return failure response
	        RegistrationResponse response = RegistrationResponse.newBuilder()
	        		.setCodeValue(ExitStatus.ID_ALREADY_EXISTING_VALUE) 
	                .build();
	        responseObserver.onNext(response);
	        responseObserver.onCompleted();
	        return;
	    }
		if(paramsList == null || paramsList.size() == 0 ) {
			RegistrationResponse response = RegistrationResponse.newBuilder()
			.setCodeValue(ExitStatus.GENERIC_FAILURE_VALUE) 
			.build();
			responseObserver.onNext(response);
			responseObserver.onCompleted();
			return;
		}

	    List<Parameter> negotiatedParams = negotiateParameters(paramsList);
		// checkare che la neg e andata bene 
		if (negotiatedParams.size() == 0 ) {
			RegistrationResponse response = RegistrationResponse.newBuilder()
			.setCodeValue(ExitStatus.NEGOTIATION_FAILURE_VALUE) 
			.build();
			responseObserver.onNext(response);
			responseObserver.onCompleted();
			return;
		} 
	    savedClients.put(id, negotiatedParams);
	    // Return success response with the actual params used
	    RegistrationResponse response = RegistrationResponse.newBuilder()
	            .setCodeValue(ExitStatus.OK_VALUE)
	            .addAllParams(negotiatedParams)
	            .build();
	    responseObserver.onNext(response);
	    responseObserver.onCompleted();
	}
	
	
	private List<Parameter> negotiateParameters(List<Parameter> requestedParams) {
	    List<Parameter> negotiatedParams = new ArrayList<>();

	    // Iterate over requested parameters and perform negotiation
	    for (Parameter requestedParam : requestedParams) {
	        String direction = requestedParam.getDir().toString();
	        String type = requestedParam.getType().toString();
	        int requestedMaxSize = requestedParam.getMaxSize();
	        // Get acceptable maximum size for the given direction and type
	        String key = direction + ":" + type;
	        Integer acceptableMaxSize = acceptableParameters.get(key);
	        if (acceptableMaxSize == null) {
	            // No acceptable parameters defined for this type, skip this parameter
	            continue;
	        } else {
	            // Negotiate the maximum size
	            int negotiatedMaxSize;
	            if (requestedMaxSize == 0) {
	                // If the requested maximum size is 0, set it to the maximum value of the service
	                negotiatedMaxSize = acceptableMaxSize;
	            } else if (acceptableMaxSize == 0) {
	                // If the acceptable maximum size is 0, set it to the requested size by the client
	                negotiatedMaxSize = requestedMaxSize;
	            } else {
	                // If both requested and acceptable maximum sizes are not 0, set it to the minimum of the two
	                negotiatedMaxSize = Math.min(requestedMaxSize, acceptableMaxSize);
	            }

	            // Create the negotiated parameter
	            Parameter negotiatedParam = Parameter.newBuilder()
	                    .setDir(requestedParam.getDir())
	                    .setType(requestedParam.getType())
	                    .setMaxSize(negotiatedMaxSize)
	                    .build();

	            // Add the negotiated parameter to the list
	            negotiatedParams.add(negotiatedParam);
	        }
	    }

	    return negotiatedParams;
	}



	@Override
	public StreamObserver<ConversionRequest> fileConvert(final StreamObserver<ConversionReply> responseObserver) {
		
		  final ByteArrayOutputStream baos = new ByteArrayOutputStream();
	      final AtomicBoolean completed = new AtomicBoolean(false);
	      final StringBuffer typeOrigin = new StringBuffer("");
	      final StringBuffer typeTarget = new StringBuffer("");
	      final AtomicBoolean success = new AtomicBoolean(true);
	      final StringBuffer clientId = new StringBuffer("");
	      final AtomicInteger exitStatus = new AtomicInteger(ExitStatus.OK_VALUE); 

	      return new StreamObserver<ConversionRequest>() {
	            @Override
	            public void onNext(ConversionRequest dataChunk) {
	            	
	            	if(success.get()) {
	            		try {
		            		switch(dataChunk.getRequestOneofCase().getNumber()) {
				            	//meta data information is received
				            	case ConversionRequest.META_FIELD_NUMBER : {
				            		typeOrigin.append(dataChunk.getMeta().getFileTypeOrigin());
				            		typeTarget.append(dataChunk.getMeta().getFileTypeTarget());
					                clientId.append(dataChunk.getMeta().getId()) ;
				            	}
				            	//file chunk is received
				            	case ConversionRequest.FILE_FIELD_NUMBER : {
					                   baos.write(dataChunk.getFile().toByteArray());
				            	}	
		            		}
		            	} catch (IOException e) {
		                    logger.log(Level.INFO,"error on write to byte array stream", e);
		                    onError(e);
		                } catch(Exception e) {
		                	logger.log(Level.INFO,"error on receiving the file", e);
		                    onError(e);
		                }
	            	}
	            }

	            @Override
	            public void onError(Throwable t) {
	                logger.log(Level.INFO, "error in receiving the file", t);
	                success.set(false);
	                exitStatus.set(ExitStatus.GENERIC_FAILURE_VALUE);
	            }

	            @Override
	            public void onCompleted() {
	                logger.log(Level.INFO, "file has been received!");
	                completed.compareAndSet(false, true);
	                 
					if(!savedClients.containsKey(clientId.toString())) {
	                	success.set(false);
	                	exitStatus.set(ExitStatus.NOT_REGISTERED_ID_VALUE);
	                	logger.log(Level.INFO,"ID is not in the known ones");
	                  }
	                 
					List<Parameter> negotiated = savedClients.get(clientId.toString());
					int maxInputSize = 0 ; 
					int maxOutputSize = 0 ; 
				
	                 if(success.get()) {
						boolean isOriginSupported = false;
						for (Parameter param : negotiated) {
							if (param.getDir() == Direction.INPUT && param.getType().toString().equalsIgnoreCase(typeOrigin.toString())) {
								isOriginSupported = true;
								maxInputSize = param.getMaxSize() ;   
								break;
							}
						}
						if (!isOriginSupported) {
							success.set(false);
							exitStatus.set(ExitStatus.INPUT_TYPE_NOT_SUPPORTED_VALUE);
						}
	                 }

	                 if(success.get()) {
						boolean isTargetSupported = false;
						for (Parameter param : negotiated) {
							if (param.getDir() == Direction.OUTPUT && param.getType().toString().equalsIgnoreCase(typeTarget.toString())) {
								isTargetSupported = true;
								maxOutputSize = param.getMaxSize() ; 
								break;
							}
						}
						if (!isTargetSupported) {
							success.set(false);
							exitStatus.set(ExitStatus.OUTPUT_TYPE_NOT_SUPPORTD_VALUE);
						}
	                 }
	                 
	                 // 2 check input size TODO 

					 if(success.get()) {
						if (baos.size()/1024 > maxInputSize && maxInputSize != 0 ) {
							success.set(false) ; 
							exitStatus.set(ExitStatus.INVALID_INPUT_SIZE_VALUE);
						}
					 }
	                // possibly removable
	                 if(success.get()){	                //check if media types are supported
	                	if(!typeOrigin.toString().equalsIgnoreCase("png") && !typeOrigin.toString().equalsIgnoreCase("jpg")
	    	        		&& !typeOrigin.toString().equalsIgnoreCase("gif") && !typeTarget.toString().equalsIgnoreCase("png") && !typeTarget.toString().equalsIgnoreCase("jpg") 
	    	        		&& !typeTarget.toString().equalsIgnoreCase("gif") 
	    	        		) {
	                		logger.log(Level.INFO, "media type not supported!");
	                		success.set(false);
	                		exitStatus.set(ExitStatus.INPUT_TYPE_NOT_SUPPORTED_VALUE);
	                	}
	                }
	                
	                //conversion
	    	        ByteArrayOutputStream baosImageToSend = new ByteArrayOutputStream();
	    	        if(success.get()) {
	    				try {
	    					byte[] bytes = baos.toByteArray();
	    				    ByteArrayInputStream bais = new ByteArrayInputStream(bytes);
	    				    BufferedImage imageReceived;
	    					imageReceived = ImageIO.read(bais);
	    					if(imageReceived.getColorModel().getTransparency() != Transparency.OPAQUE) {
	    						imageReceived = fillTransparentPixels(imageReceived, Color.WHITE);
	    					}
	    				    ImageIO.write(imageReceived, typeTarget.toString(), baosImageToSend);   
	    				} catch (IOException e) {
	    					success.set(false);
	    					exitStatus.set(ExitStatus.CONVERSION_FAILURE_VALUE);
	    					e.printStackTrace();
	    				}
	    	        }
	    	        
	    			// check output size 
					if(success.get()) {
						if (baosImageToSend.size()/1024 > maxOutputSize && maxOutputSize != 0 ) {
							success.set(false) ; 
							exitStatus.set(ExitStatus.INVALID_OUTPUT_SIZE_VALUE);
						}
					 }
	    	        
	    	        
	    			//send back
	    	       
	    			
	    			//Case 1: success
	    			if(success.get()) {
	    				logger.log(Level.INFO, "conversion has been successful!");
	    				responseObserver.onNext(ConversionReply.newBuilder()
	    			            .setMeta(MetadataReply.newBuilder().setCodeValue(ExitStatus.OK_VALUE))
	    			            .build());
	    				
	    				BufferedInputStream bisImageToSend = new BufferedInputStream(new ByteArrayInputStream(baosImageToSend.toByteArray()));

	    	            int bufferSize = 1 * 1024; // 1KB
	    	            byte[] buffer = new byte[bufferSize];
	    	            int length;
	    	            try {
	    					while ((length = bisImageToSend.read(buffer, 0, bufferSize)) != -1) {
	    					    responseObserver.onNext(ConversionReply.newBuilder()
	    					            .setFile(ByteString.copyFrom(buffer, 0, length))
	    					            .build());
	    					}
	    				} catch (IOException e) {
	    					e.printStackTrace();
	    					responseObserver.onError(e);
	    				}
	    	            try {
							bisImageToSend.close();
						} catch (IOException e) {
							e.printStackTrace();
							responseObserver.onError(e);
						}
	    	            
	    			} 
	    			//Case 2: error
	    			else {
	    				logger.log(Level.INFO, "conversion has failed!");
	    				responseObserver.onNext(
	    						ConversionReply.newBuilder()
	    			            	.setMeta(
	    			            		MetadataReply.newBuilder()
	    			            		.setCodeValue(exitStatus.get())
	    			            		.build())
	    			            .build());
	    			}
	    			
	    			responseObserver.onCompleted();
	                           
	            }
	        };     
	}; 
	
	
	public static BufferedImage fillTransparentPixels( BufferedImage image, Color fillColor ) {
		int w = image.getWidth();
		int h = image.getHeight();
		BufferedImage image2 = new BufferedImage(w, h, 
		BufferedImage.TYPE_INT_RGB);
		Graphics2D g = image2.createGraphics();
		g.setColor(fillColor);
		g.fillRect(0,0,w,h);
		g.drawRenderedImage(image, null);
		g.dispose();
		return image2;
	}
};