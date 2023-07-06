// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: LicenseRef-.amazon.com.-AmznSL-1.0
// Licensed under the Amazon Software License  http://aws.amazon.com/asl/

const Alexa = require('ask-sdk-core');
const axios = require("axios");
const AWS = require("aws-sdk");
const ddbAdapter = require('ask-sdk-dynamodb-persistence-adapter');

// You can get these values from Skill Dashboard > Tools > Permissions > Alexa Skill Messaging section. 
const AlexaClientID = "";
const AlexaClientSecret = "";


const launchDocument = require('./documents/launch_template.json');
const plantCareDocument = require('./documents/plant_care.json');

/* *
 * UsagesInstalled triggers when a user installs your widget package on their device
 * Your skill receives this event if your widget manifest has installStateChanges set to INFORM
 * For every widget that the user installs, you will receive an unique instance ID in instanceId property.  
 * */
const InstallWidgetRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "Alexa.DataStore.PackageManager.UsagesInstalled";
    },
    async handle(handlerInput) {
        // read user profile information with last known watered date from DynamoDB (if exists)
        const { attributesManager } = handlerInput;
        const attributes = await attributesManager.getPersistentAttributes() || {};
        
        /* write last known watered date to local DataStore of the Alexa device this 
        widget just got installed on. It lets the newly installed widget show the latest 
        known watered date for this user */
        const commands = [
            {
                type: "PUT_OBJECT",
                namespace: "plantCareReminder",
                key: "plantData",
                content: {
                    lastWateredDate: attributes.date || ""
                }
            }
        ];
        /* to push an update to the device's DataStore we first need to obtain an 
        access token from Alexa service */
        const tokenResponse = await getAccessToken();
        
        /* we target all devices of the current user so that all their Plant Care 
        widgets will receive the last watered date */
        const target = {
            type: "USER",
            id: handlerInput.requestEnvelope.context.System.user.userId
        };

        // push update to DataStore service which will distribute the update to all targeted devices
        await updateDatastore(tokenResponse, commands, target);

        /* Optional: track the widget instance id for a user in their profile data to know 
        how many widget instances they are running on their devices. You can use this information
        e.g. to promote installing the widget to a user who's known to not yet have any widget
        instances running on any of their devices. */
        const instanceId = handlerInput.requestEnvelope.request.payload.usages[0].instanceId;
        /* please note that only the widget instance id represents a single widget installation.
        A user can install and run the Plant Care widget multiple times on a single device */
        if (!Array.isArray(attributes.instances) || !attributes.instances.includes(instanceId)) {
            attributes.instances = [...(attributes.instances || []), instanceId];
            attributesManager.setPersistentAttributes(attributes);
            await attributesManager.savePersistentAttributes()
        }

        return handlerInput.responseBuilder.getResponse();
    }
};

/* *
 * UsagesRemoved triggers when a user removes your widget package on their device.  
 * */
const RemoveWidgetRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "Alexa.DataStore.PackageManager.UsagesRemoved";
    },
    async handle(handlerInput) {
        const instanceId = handlerInput.requestEnvelope.request.payload.usages[0].instanceId;
        const { attributesManager } = handlerInput;
        const attributes = await attributesManager.getPersistentAttributes() || {};

        // Remove the instance from the array when the widget has been removed.
        if (Array.isArray(attributes.instances) || attributes.instances.includes(instanceId)) {
            attributes.instances = attributes.instances.filter(item => item !== instanceId);
            attributesManager.setPersistentAttributes(attributes);
            await attributesManager.savePersistentAttributes();
        }

        return handlerInput.responseBuilder.getResponse();
    }
};

/* *
 * UpdateRequest triggers when a user receives an widget update on their device
 * Your skill receives this event if your widget manifest has updateStateChanges set to INFORM  
 * */
const UpdateWidgetRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "Alexa.DataStore.PackageManager.UpdateRequest";
    },
    async handle(handlerInput) {
        /* for now this information is not needed by this sample skill. 
        Optional: it will be logged for tracking purposes. */
        console.log("From Version" + handlerInput.requestEnvelope.request.fromVersion);
        console.log("To Version" + handlerInput.requestEnvelope.request.toVersion);

        return handlerInput.responseBuilder.getResponse();
    }
};

/* *
 * InstallationError triggers notify the skill about any errors that happened during package installation, removal, or updates.
 * */
const WidgetInstallationErrorHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "Alexa.DataStore.PackageManager.InstallationError";
    },
    async handle(handlerInput) {
        console.log("Error Type: " + handlerInput.requestEnvelope.request.error.type);

        const speakOutput = "Sorry, there was an error installing the widget. Please try again later";
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};


/* *
 * Helper function to generate an access token with the scope alexa::datastore. 
 * AlexaClientID and AlexaClientSecret are fetched from the Permissions page
 * */
function getAccessToken() {
    let config = {
        method: "post",
        url: "https://api.amazon.com/auth/o2/token",
        timeout: 3000,
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            charset: "utf-8",
        },
        params: {
            grant_type: "client_credentials",
            client_id: AlexaClientID,
            client_secret: AlexaClientSecret,
            scope: "alexa::datastore"
        }
    };

    return axios(config)
        .then(function (response) {
            return response.data;
        })
        .catch(function (error) {
            console.log(error)
        });
}

/* *
 * Helper function to generate an access token with the scope alexa::datastore. 
 * AlexaClientID and AlexaClientSecret are fetched from the Permissions page
 * */
async function updateDatastore(token, commands, target) {
    const config = {
        method: "post",
        url: `https://api.amazonalexa.com/v1/datastore/commands`,
        headers: {
            "Content-Type": "application/json",
            Authorization: `${token.token_type} ${token.access_token}`
        },
        data: {
            commands: commands,
            target: target
        }
    };

    return axios(config)
        .then(function (response) {
            console.log(JSON.stringify(response.data));
            return response.data;
        })
        .catch(function (error) {
            console.log(error);
        });
}

/* *
 * Handler to process any incoming APL UserEvent that originates from a SendEvent command
 * from within the Plant Care widget or the Plant Care skill APL experience
 * */
const APLEventHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "Alexa.Presentation.APL.UserEvent";
    },
    async handle(handlerInput) {
        /* obtain the first argument that is handed in by the SendEvent 
        command of an APL document. It is supposed to indicate the type of 
        user action e.g. a button that was tapped */
        const eventType = handlerInput.requestEnvelope.request.arguments[0]; 
        let shouldEndSession = false; 
        
        switch(eventType){
            case 'openSkill': 
                // If the user taps on header, launch the skill. 
                return LaunchRequestHandler.handle(handlerInput);
            case 'plantWateredWidget': 
                // If the user taps on the button through widget, set the withShouldEndSession to true. 
                shouldEndSession = true;
                break; 
            case 'plantWateredSkill':
                // If the user taps on the button through the APL document within skill, the session is not ended and sends a speech response back. 
                const speakOutput = `The plant has now been watered.`;
                handlerInput.responseBuilder.speak(speakOutput);
                break;
        }
        
        // get last watered plant date as handed in by the skill
        const date = handlerInput.requestEnvelope.request.arguments[1];
        const userId = handlerInput.requestEnvelope.context.System.user.userId;
        const { attributesManager } = handlerInput;
        const attributes = await attributesManager.getPersistentAttributes() || {};

        // write last watered date to user profile in DynamoDB
        attributes.date = date;
        attributesManager.setPersistentAttributes(attributes);
        await attributesManager.savePersistentAttributes();

        // propagate update to DataStore to send it down to all the devices of a user to reflect in their widgets
        const commands = [
            {
                type: "PUT_OBJECT",
                namespace: "plantCareReminder",
                key: "plantData",
                content: {
                    lastWateredDate: date
                }
            }
        ];

        const target = {
            type: "USER",
            id: userId
        };

        const tokenResponse = await getAccessToken();
        await updateDatastore(tokenResponse, commands, target);
        return handlerInput.responseBuilder
            .withShouldEndSession(shouldEndSession)
            .getResponse();
    },
};

const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    async handle(handlerInput) {
        const speakOutput = 'Welcome to the Plant Care Skill. You can say water my plant to water it or say help to know more. What would you like to do?';

        if (Alexa.getSupportedInterfaces(handlerInput.requestEnvelope)["Alexa.Presentation.APL"]) {
            handlerInput.responseBuilder
                .addDirective({
                    type: "Alexa.Presentation.APL.RenderDocument",
                    document: launchDocument,
                    datasources: {
                        headlineTemplateData: {
                            type: "object",
                            objectId: "headlineSample",
                            properties: {
                                backgroundImage: {
                                    contentDescription: null,
                                    smallSourceUrl: null,
                                    largeSourceUrl: null,
                                    sources: [
                                        {
                                            url: "https://d2o906d8ln7ui1.cloudfront.net/images/templates_v3/headline/HeadlineBackground_Dark.png",
                                            size: "large"
                                        }
                                    ]
                                },
                                textContent: {
                                    primaryText: {
                                        type: "PlainText",
                                        text: "Welcome to The Plant Care Skill"
                                    }
                                },
                                logoUrl: "https://d2o906d8ln7ui1.cloudfront.net/images/templates_v3/logo/logo-modern-botanical-white.png",
                                hintText: "Try, \"Alexa, water my plant\""
                            }
                        }
                    }
                }
                )
        }
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const PlantCareIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getIntentName(handlerInput.requestEnvelope) === 'PlantCareIntent';
    },
    async handle(handlerInput) {
        const { attributesManager } = handlerInput;
        const attributes = await attributesManager.getPersistentAttributes() || {};
        
        if (Alexa.getSupportedInterfaces(handlerInput.requestEnvelope)["Alexa.Presentation.APL"]) {
            handlerInput.responseBuilder
                .addDirective({
                    type: "Alexa.Presentation.APL.RenderDocument",
                    document: plantCareDocument,
                    datasources: {
                        alexaPhotoData: {
                            title: "Plant Care Reminder",
                            backgroundImage: {
                                sources: [
                                    {
                                        url: "https://d2o906d8ln7ui1.cloudfront.net/images/templates_v3/long_text/LongTextSampleBackground_Dark.png",
                                        size: "large"
                                    }
                                ]
                            },
                            lastWateredDate: attributes.date || "",
                            primaryText: "Haworthia Zebra Plant",
                            secondaryText: "Water today",
                            buttonText: "I watered my plant"
                        }
                    }
                }
                )
        }
        
        const speakOutput = 'Tap on the button to water your plant.';
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};

const HelpIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        const speakOutput = 'The Plant Care Skill lets you keep track of if and when you watered your plant. You can say water my plant to water it.';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const CancelAndStopIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
                || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
    },
    handle(handlerInput) {
        const speakOutput = 'Goodbye!';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};

/* *
 * FallbackIntent triggers when a user says something that doesn’t map to any intents in your skill
 * It must also be defined in the language model (if the locale supports it)
 * This handler can be safely added but will be ingnored in locales that do not support it yet 
 * */
const FallbackIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
    },
    handle(handlerInput) {
        const speakOutput = 'Sorry, I don\'t know about that. Please try again.';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

/* *
 * SessionEndedRequest notifies that a session was ended. This handler will be triggered when a currently open 
 * session is closed for one of the following reasons: 1) The user says "exit" or "quit". 2) The user does not 
 * respond or says something that does not match an intent defined in your voice model. 3) An error occurs 
 * */
const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        console.log(`~~~~ Session ended: ${JSON.stringify(handlerInput.requestEnvelope)}`);
        // Any cleanup logic goes here.
        return handlerInput.responseBuilder.getResponse(); // notice we send an empty response
    }
};

/* *
 * The intent reflector is used for interaction model testing and debugging.
 * It will simply repeat the intent the user said. You can create custom handlers for your intents 
 * by defining them above, then also adding them to the request handler chain below 
 * */
const IntentReflectorHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest';
    },
    handle(handlerInput) {
        const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
        const speakOutput = `You just triggered ${intentName}`;

        return handlerInput.responseBuilder
            .speak(speakOutput)
            //.reprompt('add a reprompt if you want to keep the session open for the user to respond')
            .getResponse();
    }
};

/**
 * Generic error handling to capture any syntax or routing errors. If you receive an error
 * stating the request handler chain is not found, you have not implemented a handler for
 * the intent being invoked or included it in the skill builder below 
 * */
const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        const speakOutput = 'Sorry, I had trouble doing what you asked. Please try again.';
        console.log(`~~~~ Error handled: ${JSON.stringify(error)}`);

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};


const LoggingRequestInterceptor = {
    process(handlerInput) {
        console.log(`=== INCOMING SKILL REQUEST: ${JSON.stringify(handlerInput.requestEnvelope)}`);
    }
};

/**
 * This handler acts as the entry point for your skill, routing all request and response
 * payloads to the handlers above. Make sure any new handlers or interceptors you've
 * defined are included below. The order matters - they're processed top to bottom 
 * */
exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        InstallWidgetRequestHandler,
        RemoveWidgetRequestHandler,
        UpdateWidgetRequestHandler,
        WidgetInstallationErrorHandler,
        APLEventHandler,
        LaunchRequestHandler,
        PlantCareIntentHandler,
        HelpIntentHandler,
        CancelAndStopIntentHandler,
        FallbackIntentHandler,
        SessionEndedRequestHandler,
        IntentReflectorHandler)
    .addErrorHandlers(
        ErrorHandler)
    .withCustomUserAgent('sample/widget/v1.2')
    .withPersistenceAdapter(
        new ddbAdapter.DynamoDbPersistenceAdapter({
            tableName: process.env.DYNAMODB_PERSISTENCE_TABLE_NAME,
            createTable: false,
            dynamoDBClient: new AWS.DynamoDB({ apiVersion: 'latest', region: process.env.DYNAMODB_PERSISTENCE_REGION })
        })
    )
    .addRequestInterceptors(LoggingRequestInterceptor)
    .lambda();