const functions = require('firebase-functions');
const admin = require('./firebase-super');
const app = require('./app');


exports.app = functions.https.onRequest(app);
exports.sendNotification = functions.database.ref('/messages/{workspaceId}/{id}/{messageId}')
    .onWrite((change, context) => {
        if (!change.after.val()) {
            return console.log('A Notification has been deleted from the database : ');
        }
        const workspaceId = context.params.workspaceId;
        console.log("Notification exists");
        const message = change.after.val();
        const messageBody = message.body;
        const senderId = message.from;
        const receiverUid = message.to;
        console.log('We have a notification for : ', receiverUid);
        const getInstanceIdPromise = admin.database().ref(`/Users/${workspaceId}/${receiverUid}/deviceToken`).once('value');
        const getSenderDataPromise = admin.database().ref(`/Users/${workspaceId}/${senderId}/firstName`).once('value');
        const getSenderPhotoUrlPromise = admin.database().ref(`/Users/${workspaceId}/${senderId}/profileImageUrl`).once('value');

        Promise.all([getInstanceIdPromise, getSenderDataPromise, getSenderPhotoUrlPromise]).then(results => {
            const instanceId = results[0].val();
            const senderName = results[1].val();
            const senderUrl = results[2].val();
            console.log('notifying ' + receiverUid + ' about ' + messageBody + ' from ' + senderName);
            const payload = {
                data: {
                    title: "New Message from " + senderName,
                    body: messageBody
                }
            };
            return admin.messaging().sendToDevice(instanceId, payload)
                .then(response => {
                    console.log("Successfully sent message:", response);
                    return response;
                })
                .catch(error => {
                    console.log("Error sending message:", error);
                });
        }).catch(error => {
            console.log("An error occurred: " + error);
        });
    });

exports.sendNewFileUploadNotification = functions.database.ref('/clientUploads/{workspaceId}/{clientBusinessName}/{uploadId}').onCreate((snapshot, context) => {
    const clientBusinessName = context.params.clientBusinessName;
    const workspaceId = context.params.workspaceId;
    const getAllHrTokens = admin.database().ref(`/Users/${workspaceId}/`).orderByChild('role').equalTo("Human Resource").once("value");

    Promise.all([getAllHrTokens]).then(snapshot => {
        //console.log(snapshot.numChildren());
        const tokens = [];
        snapshot.forEach(childSnapshot => {
            const childData = childSnapshot.val();
            var result = Object.keys(childData).map(key => {
                return [Number(key), childData[key]];
            });
            for (var i = 0; i < result.length; i++) {
                var deviceToken = result[i][1].deviceToken;
                //console.log(deviceToken);
                if (deviceToken === undefined) {
                    console.log("device token is null");
                    continue;
                }
                tokens.push(deviceToken);
            }
        });
        const payload = {
            data: {
                title: "New Client Upload!",
                body: clientBusinessName + " just uploaded a new file"
            },
            tokens: tokens
        };
        return admin.messaging().sendMulticast(payload).then(response => {
            if (response.failureCount > 0) {
                const failedTokens = [];
                response.responses.forEach((resp, idx) => {
                    if (!resp.success) {
                        failedTokens.push(tokens[idx]);
                    }
                });
                console.log('List of tokens that caused failures: ' + failedTokens);
            }
            console.log("notification sent to HR");
            return "notification sent";
        });
    }).catch(error => {
        console.log("error getting tokens" + error);
        return 0;
    });
    return "function end";
});

exports.sendNewTaskNotification = functions.database.ref('/tasks/{workspaceId}/{uid}/{taskId}').onCreate((snapshot, context) => {
    const data = snapshot.val();
    const taskId = context.params.taskId;
    if (data === null) {
        return console.log("Task not found");
    }
    const workspaceId = context.params.workspaceId;
    const uid = context.params.uid;
    const getUserTokenRPromise = admin.database().ref(`/Users/${workspaceId}/${uid}/deviceToken`).once('value');
    Promise.all([getUserTokenRPromise]).then(results => {
        const userDeviceToken = results[0].val();
        const payload = {
            data: {
                title: "New Task!",
                body: "You have been assigned a new task",
                task_id: taskId,
                pending_intent_id: String(data.pendingIntentId)
            }
        };
        return admin.messaging().sendToDevice(userDeviceToken, payload)
            .then(response => {
                console.log("Successfully sent notification:", response);
                return admin.database().ref(`/notifications/${workspaceId}/${uid}/newTaskReceived`).set(true).then(response1 => {
                    console.log("add dots", response1);
                    return "add dot";
                }).catch(error => {
                    console.log("error" + error);
                    return "error";
                });
            })
            .catch(error => {
                console.log("Error sending notification:", error);
                return "error";
            });
    }).catch(error => {
        console.log("error " + error);
    });
});

exports.createLogForNewSocialAccountAdded = functions.database.ref('/socialAccounts/{workspaceId}/{socialAccountId}').onCreate((snapshot, context) => {
    if (context.authType === 'ADMIN') {
        console.log("Admin request");
    } else if (context.authType === 'USER') {
        console.log(snap.val(), 'written by', context.auth.uid);
    }

    const data = snapshot.val();
    if (data === null) {
        return console.log("social account not found");
    }
    const workspaceId = context.params.workspaceId;
    console.log(data.accountType);
    var d = Date(Date.now());
    var logString = `A new ${data.accountType} account with username ${data.accountUsername} has been added by the social media manager. On ${d.toString()}`;
    console.log(logString);
    var pushId = admin.database().ref(`/logs/${workspaceId}`).push().getKey();
    console.log(pushId);
    return admin.database().ref(`/logs/${workspaceId}/${pushId}`).set(logString).then((response) => {
        console.log("Successfully added log: ", response);
        return response;
    }).catch((error) => {
        console.log("Error adding log: ", error);
    });

});

exports.createLogForNewUserAdded = functions.database.ref('/Users/{workspaceId}/{uid}').onCreate((snapshot, context) => {
    if (context.authType === 'ADMIN') {
        console.log("Admin request");
    } else if (context.authType === 'USER') {
        console.log(snap.val(), 'written by', context.auth.uid);
    }

    const workspaceId = context.params.workspaceId;
    const data = snapshot.val();
    if (data === null) {
        return console.log("user account not found");
    }
    var d = Date(Date.now());
    var logString = `A new ${data.role} account has been has been created. On ${d.toString()}. \nFirstname: ${data.firstName} \nFastName: ${data.lastName}`;
    console.log(logString);
    var pushId = admin.database().ref(`/logs/${workspaceId}`).push().getKey();
    console.log(pushId);
    return admin.database().ref(`/logs/${workspaceId}/${pushId}`).set(logString).then((response) => {
        console.log("Successfully added log: ", response);
        return response;
    }).catch((error) => {
        console.log("Error adding log: ", error);
    });

});

exports.createLogForNewScheduledPost = functions.database.ref('/scheduledPosts/{workspaceId}/{postId}').onCreate((snapshot, context) => {
    if (context.authType === 'ADMIN') {
        console.log("Admin request");
    } else if (context.authType === 'USER') {
        console.log(snap.val(), 'written by', context.auth.uid);
    }

    const data = snapshot.val();
    if (data === null) {
        return console.log("post not found");
    }
    const workspaceId = context.params.workspaceId;
    var d = Date(Date.now());
    var logString = `A new post has been scheduled for approval on ${d.toString()} for ${data.accountType} account with username: ${data.accountUsername}.`;
    console.log(logString);
    var pushId = admin.database().ref(`/logs/${workspaceId}`).push().getKey();
    console.log(pushId);
    return admin.database().ref(`/logs/${workspaceId}/${pushId}`).set(logString).then((response) => {
        console.log("Successfully added log: ", response);
        return response;
    }).catch((error) => {
        console.log("Error adding log: ", error);
    });

});

exports.createLogForNewOpenedTicket = functions.database.ref('/tickets/{workspaceId}/{ticketId}').onCreate((snapshot, context) => {
    const data = snapshot.val();
    if (data === null) {
        return console.log("ticket not found");
    }

    const workspaceId = context.params.workspaceId;
    const uid = data.openedBy;
    const getClienNameBusinessNamePromise = admin.database().ref(`/Users/${workspaceId}/${uid}/businessName`).once('value');
    return Promise.all([getClienNameBusinessNamePromise]).then(results => {
        const businessName = results[0].val();
        var d = Date(Date.now());
        var logString = `A new ${data.category} ticket has been opened by ${businessName} on ${d.toString()}.`;
        var pushId = admin.database().ref(`/logs/${workspaceId}`).push().getKey();
        return admin.database().ref(`/logs/${workspaceId}/${pushId}`).set(logString).then((response) => {
            console.log("Successfully added log: ", response);
            return response;
        }).catch((error) => {
            console.log("Error adding log: ", error);
            return error;
        });
    }).catch(error => {
        console.log("error " + error);
    });
});

exports.createLogForNewUserTask = functions.database.ref('/tasks/{workspaceId}/{uid}/{taskId}').onCreate((snapshot, context) => {
    const data = snapshot.val();
    if (data === null) {
        return console.log("task not found");
    }

    const workspaceId = context.params.workspaceId;
    const uid = context.params.uid;
    console.log(uid);
    const getUserFirstName = admin.database().ref(`/Users/${workspaceId}/${uid}/firstName`).once('value');
    return Promise.all([getUserFirstName]).then(results => {
        const firstName = results[0].val();
        var d = Date(Date.now());
        var logString = `A new task is available for ${firstName} to ${data.taskTitle}. Task was assigned by ${data.assignedBy} on ${d.toString()}.`;
        var pushId = admin.database().ref(`/logs/${workspaceId}`).push().getKey();
        return admin.database().ref(`/logs/${workspaceId}/${pushId}`).set(logString).then((response) => {
            console.log("Successfully added log: ", response);
            return response;
        }).catch((error) => {
            console.log("Error adding log: ", error);
        });
    }).catch(error => {
        console.log("error " + error);
    });
});

exports.createLogForNewClientUpload = functions.database.ref('/clientUploads/{workspaceId}/{clientBusinessName}/{uploadId}').onCreate((snapshot, context) => {
    if (context.authType === 'ADMIN') {
        console.log("Admin request");
    } else if (context.authType === 'USER') {
        console.log(snap.val(), 'written by', context.auth.uid);
    }

    const data = snapshot.val();
    if (data === null) {
        return console.log("upload ref not found");
    }
    const workspaceId = context.params.workspaceId;
    var d = Date(Date.now());
    var logString = `${context.params.clientBusinessName} uploaded ${data.fileName} on ${d.toString()}`;
    console.log(logString);
    var pushId = admin.database().ref(`/logs/${workspaceId}`).push().getKey();
    console.log(pushId);
    return admin.database().ref(`/logs/${workspaceId}/${pushId}`).set(logString).then((response) => {
        console.log("Successfully added log: ", response);
        return response;
    }).catch((error) => {
        console.log("Error adding log: ", error);
    });

});

exports.createLogForPartnerJob = functions.database.ref('/jobs/{workspaceId}/{userId}/{jobId}')
    .onWrite((change, context) => {
        // Only edit data when it is first created.
        if (change.before.exists()) {
            var previousData = change.before.val();
        }
        // Exit when the data is deleted.
        if (!change.after.exists()) {
            console.log("data is deleted");
            return null;
        }
        const original = change.after.val();
        if (previousData !== null) {
            const uid = context.params.userId;
            const workspaceId = context.params.workspaceId;
            const getUserFirstNamePromise = admin.database().ref(`/Users/${workspaceId}/${uid}/firstName`).once('value');
            return Promise.all([getUserFirstNamePromise]).then(result => {
                const fName = result[0].val();
                var d = Date(Date.now());
                var logString;
                if (previousData.progress === 0)
                    logString = `A new job was posted for ${fName} on ${d.toString()}`;
                else
                    logString = `${fName} updated their progress for ${original.jobType} job to ${original.progress}% done on ${d.toString()}`;
                console.log(logString);
                var pushId = admin.database().ref(`/logs/${workspaceId}`).push().getKey();
                console.log(pushId);
                return admin.database().ref(`/logs/${workspaceId}/${pushId}`).set(logString).then((response) => {
                    console.log("Successfully added log: ", response);
                    return response;
                }).catch((error) => {
                    console.log("Error adding log: ", error);
                });

            }).catch(error => {
                console.log("promise error " + error);
            });
        }
    });

exports.sendNewLogNotification = functions.database.ref('/logs/{workspaceId}/{logId}').onCreate((snapshot, context) => {
    const workspaceId = context.params.workspaceId;
    const getAllAdminTokens = admin.database().ref(`/Users/${workspaceId}`).orderByChild('role').equalTo("Admin").once("value");
    const data = snapshot.val()
    Promise.all([getAllAdminTokens]).then(snapshot => {
        //console.log(snapshot.numChildren());
        const regTokens = [];
        snapshot.forEach(childSnapshot => {
            const childData = childSnapshot.val();
            var result = Object.keys(childData).map(key => {
                return [Number(key), childData[key]];
            });
            for (var i = 0; i < result.length; i++) {
                var deviceToken = result[i][1].deviceToken;
                //console.log(deviceToken);
                if (deviceToken === undefined) {
                    console.log("device token is null");
                    continue;
                }
                regTokens.push(deviceToken);
            }
        });
        const payload = {
            data: {
                title: "New Log Available",
                body: data.toString()
            },
            tokens: regTokens
        };
        return admin.messaging().sendMulticast(payload).then(response => {
            if (response.failureCount > 0) {
                const ft = [];
                response.responses.forEach((resp, idx) => {
                    if (!resp.success) {
                        ft.push(regTokens[idx]);
                    }
                });
                console.log('List of tokens that caused failures: ' + ft);
            }
            console.log("notification sent to all admin users");
            return "notification sent";
        });
    }).catch(error => {
        console.log("error getting tokens " + error);
        return 0;
    });
    return "function end";
});

exports.contentNoteTrigger = functions.database.ref('/contentNotes/{workspaceId}/{noteId}').onWrite((change, context) => {
    const workspaceId = context.params.workspaceId;
    if (change.before.exists() && change.after.exists()) {
        const newData = change.after.val();
        console.log(newData.reviewedByAdmin);
        if (newData.reviewedByAdmin === true) {
            // note has been reviewed by admin
            const getAllContentCurators = admin.database().ref(`/Users/${workspaceId}`).orderByChild('role').equalTo("Content Curator").once("value");
            Promise.all([getAllContentCurators]).then(snapshot => {
                const regTokens = [];
                snapshot.forEach(childSnapshot => {
                    const childData = childSnapshot.val();
                    var result = Object.keys(childData).map(key => {
                        return [Number(key), childData[key]];
                    });
                    for (var i = 0; i < result.length; i++) {
                        var deviceToken = result[i][1].deviceToken;
                        if (deviceToken === undefined) {
                            console.log("device token is null");
                            continue;
                        }
                        regTokens.push(deviceToken);
                    }
                });
                var notifBody;
                if (newData.contentNotesStatus === "APPROVED") {
                    notifBody = "note has been approved by admin";
                } else {
                    notifBody = "note was disapproved by admin";
                }
                const payload = {
                    data: {
                        title: newData.contentNotesStatus,
                        body: notifBody
                    },
                    tokens: regTokens
                };
                return admin.messaging().sendMulticast(payload).then(response => {
                    if (response.failureCount > 0) {
                        const ft = [];
                        response.responses.forEach((resp, idx) => {
                            if (!resp.success) {
                                ft.push(regTokens[idx]);
                            }
                        });
                        console.log('List of tokens that caused failures: ' + ft);
                    }
                    console.log("notification sent to all admin users");
                    return "notification sent";
                }).catch(error => {
                    console.log("error: " + error);
                    return 0;
                });
            }).catch(error => {
                console.log("error: " + error);
                return 0;
            });
        } else {
            // note was updated by content curator and is requesting admin to review
            var logString = `A note has be edited by by the content curator and has requested an admin to review for approval on ${d.toString()}.`;
            var pushId = admin.database().ref(`/logs/${workspaceId}`).push().getKey();
            console.log(pushId);
            return admin.database().ref(`/logs/${workspaceId}/${pushId}`).set(logString).then((response) => {
                console.log("Successfully added log: ", response);
                return response;
            }).catch((error) => {
                console.log("Error adding log: ", error);
            });
        }
    } else {
        var d = Date(Date.now());
        var logString1 = `A new note by the content curator has been submitted for approval on ${d.toString()}.`;
        var pushId1 = admin.database().ref(`/logs/${workspaceId}`).push().getKey();
        console.log(pushId1);
        return admin.database().ref(`/logs/${workspaceId}/${pushId1}`).set(logString1).then((response) => {
            console.log("Successfully added log: ", response);
            return response;
        }).catch((error) => {
            console.log("Error adding log: ", error);
        });
    }
    // Exit when the data is deleted.
    if (!change.after.exists()) {
        return null;
    }
});

exports.deleteAllCalendarTaskOnCalendarDelete = functions.database.ref('/clientCalendarBaseTable/{workspaceId}/{clientId}/{calendarId}').onDelete((snapshot, context) => {
    const calId = context.params.calendarId;
    const workspaceId = context.params.workspaceId;
    //console.log(calId);
    return admin.database().ref(`/clientCalendarTable/${workspaceId}/${calId}`).remove().then(response => {
        console.log("response" + response);
        return 1;
    }).catch(error => {
        console.log("error", error);
        return 0;
    });
});
exports.assignTasksInCalendar = functions.database.ref('clientCalendarBaseTable/{workspaceId}/{clientId}/{calendarId}/beginPublishing').onWrite((change, context) => {
    const data = change.after.val();
    const workspaceId = context.params.workspaceId;
    if (!data) {
        return false;
    }
    const calId = context.params.calendarId;
    //console.log(calId);
    return getTaskPromise = admin.database().ref(`/clientCalendarTable/${workspaceId}/${calId}/tasks`).once('value').then(snapshot => {
        snapshot.forEach(childSnapshot => {
            const childData = childSnapshot.val();
            childData.firstAssign = true;
            //console.log(childData.assignedTo);
            admin.database().ref(`/tasks/${workspaceId}/${childData.assignedToId}/${childData.id}`).set(childData).then(response => {
                console.log("task sent");
                return response;
            }).catch(error => {
                console.log("An error occurred while sending task");
            });
        });
        return "";
    }).catch(error => {

    });
});

exports.updateCalendarTaskOnIndividualTaskUpdated = functions.database.ref('/tasks/{workspaceId}/{staffId}/{taskId}/status').onWrite((change, context) => {
    if (!change.after.exists()) {
        console.log("task was probably deleted, haha");
        return false;
    }
    const workspaceId = context.params.workspaceId;
    const taskId = context.params.taskId;
    const staffId = context.params.staffId;
    let taskStatus = change.after.val();
    if (taskStatus === 1) {
        return admin.database().ref(`/tasks/${workspaceId}/${staffId}/${taskId}`).once('value').then(snapshot => {
            taskData = snapshot.val();
            if (taskData.clientCalendarId !== undefined) {
                taskData.dateCompleted = admin.database.ServerValue.TIMESTAMP;
                taskData.status = 1;
                return admin.database().ref(`/clientCalendarTable/${workspaceId}/${taskData.clientCalendarId}/tasks/${taskId}`).set(taskData).then(response => {
                    let message = "task data in calendar updated " + response;
                    console.log(message);
                    return message;
                });
            }
            return false;
        }).catch(error => {
            console.log(error);
        });
    }
    return true;
});

exports.updateStaffTaskOnCalendarTaskChange = functions.database.ref('/clientCalendarTable/{workspaceId}/{calendarId}/tasks/{taskId}').onWrite(async (change, context) => {
    const taskId = context.params.taskId;
    const workspaceId = context.params.workspaceId;
    if (!change.after.exists()) {
        let previousData = change.before.val();
        //task was deleted, delete it from staff task too.
        try {
            const response = await admin.database().ref(`/tasks/${workspaceId}/${previousData.assignedToId}/${taskId}`).remove();
            console.log("task deleted");
            return `deleted ${response}`;
        }
        catch (error) {
            console.log(`an error occured ${error}`);
        }
    } else {
        let newData = change.after.val();
        if (newData.firstAssign === undefined || newData.status > 0) {
            console.log("has not been assigned or has been completed, can't update");
            return "has not been assigned or has been completed, can't update";
        }
        try {
            const update = await admin.database().ref(`/tasks/${workspaceId}/${newData.assignedToId}/${taskId}`).set(newData);
            console.log(`updated ${update}`);
            return "updated";
        } catch (err) {
            console.log(err);
        }
    }
    return true;
});
