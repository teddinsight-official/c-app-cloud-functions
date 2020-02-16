const express = require('express');
const app = express();
const path = require('path');
const exphbs = require('express-handlebars');
const admin = require("./firebase-super");
const cacheMiddleWare = require('./middleware')
app.use(express.json())
app.use(express.urlencoded())
app.use(express.static(path.join(__dirname, '/assets')));
app.engine('handlebars', exphbs());
app.set('view engine', 'handlebars');

app.use(cacheMiddleWare);

app.get('/', (req, res) => {
    res.render('index', { title: 'TeddInsight' })
});
app.post('/create', async (req, res) => {
    //console.table(req.body);
    let data;
    try {
        let userRecord = await admin.auth().createUser({
            email: req.body.email,
            emailVerified: false,
            phoneNumber: req.body.phone,
            password: req.body.password,
            displayName: req.body.username,
            photoURL: 'https://img.favpng.com/8/19/8/united-states-avatar-organization-information-png-favpng-J9DvUE98TmbHSUqsmAgu3FpGw.jpg',
            disabled: false
        })
        const uid = userRecord.uid;
        admin.database().ref(`Users/${req.body.workspaceId}/${uid}`).set({
            dateRegistered: new Date().getTime(),
            firstName: req.body.fname,
            lastName: req.body.lname,
            hasAccess: true,
            workspaceId: req.body.workspaceId,
            profileImageUrl: userRecord.photoURL,
            id: uid,
            phoneNumber: req.body.phone,
            role: req.body.role,
            username: req.body.username,
            email: req.body.email,
            isStaff: true
        }, (error) => {
            if (error)
                data = { status: `User was not created ${error}`, title: 'Teddinsight' }
            else
                data = { status: `User created`, title: 'Teddinsight' }
            return res.render('create', data);
        })
    } catch (error) {
        data = { status: `Error creating new user: ${error.code} ${error.message}`, title: 'Teddinsight' }
        console.log(`Error creating new user: ${error.code} ${error.message}`);
        res.render('create', data);
    }
});
app.get('/create', (req, res) => {
    res.render('create', { title: 'Create' })
});

module.exports = app;