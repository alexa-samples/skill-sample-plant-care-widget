# Build An Alexa Widget

This Alexa sample skill is a template for a basic Alexa Widget. The Plant Care widget allows you to keep track of if/when you've watered a plant. This skill is written in NodeJS and demonstrates the use of Alexa Widgets and Datastore. 

<img src="https://m.media-amazon.com/images/G/01/mobile-apps/dex/alexa/alexa-skills-kit/tutorials/quiz-game/header._TTH_.png" />

### Repository Contents	 
* `/lambda` - Back-End Logic for the Alexa Skill hosted on [AWS Lambda](https://aws.amazon.com/lambda/)
* `/skill-package` - Voice User Interface and Language Specific Interaction Models
* `/skill-package/dataStorePackages/water-care` - [APL Package for Water Care Widget](https://developer.amazon.com/en-US/docs/alexa/alexa-presentation-language/apl-widgets-reference.html#apl-package) 


## Skill Architecture

Each skill consists of two basic parts, a front end and a back end.
The front end is the voice interface, or VUI.
The voice interface is configured through the voice interaction model.
The back end is where the logic of your skill resides.

## Widget Architecture 

Each widget package consists of four parts 
datasources - where your data sources reside
documents - where your actual APL document for the widget resides
presentations - where your package definitions go in 
manifest.json - where your widget information would go. This information displays on the Widget gallery. 
---

## Additional Resources

### Community
* [Amazon Alexa Developer Slack](https://alexa.design/slack) - Join the conversation!

### Documentation
* [Official Alexa Skills Kit SDK for Node.js](http://alexa.design/node-sdk-docs) - The Official Node.js SDK Documentation
* [Official Alexa Skills Kit Documentation](https://developer.amazon.com/docs/ask-overviews/build-skills-with-the-alexa-skills-kit.html) - Official Alexa Skills Kit Documentation
* [Alexa Widget Developer Documentation](https://alexa.design/widgets) - Alexa Widgets Developer Documentation