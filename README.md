# Design Manual

This is a DfE Manual


## Prerequisites

Node.JS LTS version

GitHub

and Nodemon installed globally

Run `npm i nodemon -g`


## Steps

1. create a .env file on the root of your project
2. add the values below (from the env settings section)
3. go to the package.json file and change the name of your manual to something else (must be lowecase with hyphens instead of spaces)
4. 

Run `npm install`

Run `npm run dev`

## Env settings



```
recaptchaPublic=x
recaptchaSecret=x
feedbackTemplateID=x
notifyKey=preprod-x
BASE_URL=http://localhost:3066
```
Contact Design Ops for the keys to use in your local environment. These must never be checked in to source code - the file is included in the .GITIGNORE file.


While this is the same command for GOV.UK prototypes, this app is not built using the kit.

We've just made it easier to remember what commands to run for those unfamiliar with 
running Node apps locally.

> Information
>
> When running this command, you may see "Deprecation Warning: Using / for division outside of calc() is deprecated and will be removed in Dart Sass 2.0.0."
> 
> These are from the GOV.UK Frontend and you do not need to do anything.
