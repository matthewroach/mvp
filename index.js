'use strict'

const MongoClient = require('mongodb').MongoClient
const ObjectID = require('mongodb').ObjectID

const url = ''


exports.handler = (event, context, callback) => {
	let text = ''
	let decodedText = decodeURIComponent(event.text).replace(/\+/g, ' ')

	if ( decodedText.substr(0,1) === '@' ) {
		castVote(event, context, callback)
	} else {
		let decodedSplit = decodedText.split(/ (.+)?/)
		let action = decodedSplit[0].toLowerCase()
		let name = decodedSplit[1]

		switch(action) {
			case 'start':
				openVoting(event, name, context, callback)
				break
			case 'stop':
				closeVoting(event, name, context, callback)
				break
			default:
				text = 'The action you are try to perform is not valid'
				break
		}
	}
}


function openDB() {
	return new Promise((resolve, reject) => {
		MongoClient.connect(url, (err, db) => {
			if ( err ) {
				reject(err)
			} else {
				resolve(db)
			}
		})
	})
}


function closeDB(db) {
	if ( db ) {
		db.close()
	}
}


function castVote(event, context, callback) {
	let user = decodeURIComponent(event.text).replace(/\+/g, ' ').split('@')[1]
	if ( user === event.user_name ) {
		context.callbackWaitsForEmptyEventLoop = false
		callback(null, {
			'text': 'You can not vote for yourself as MVP, please vote again'
		})
	}

	openDB().then((db) => {
		return db.collection(`votes-${event.team_domain}`)
	}).then((collection) => {
		return collection.find({ active: true }).toArray().then((docs) => {
			if ( !docs.length ) {
				context.callbackWaitsForEmptyEventLoop = false
				callback(null, {
					'text': 'Voting is not open yet'
				})
			}

			for ( let i in docs[0].voted ) {
				if ( docs[0].voted[i] == event.user_id ) {
					context.callbackWaitsForEmptyEventLoop = false
					callback(null, {
						'text': 'You are only allowed to vote once'
					})
				}
			}

			let action = {}
			action['votes.'+user] = 1
			return collection.findAndModify(
				{	active: true },
				{},
				{ $inc: action, $push: { voted: event.user_id } },
				{ upsert: true }
			).then((object) => {
				return object
			})

		})
	}).then((result) => {
		context.callbackWaitsForEmptyEventLoop = false
		callback(null, {
			'text': 'Thank you, your vote has been cast'
		})
	}).catch((err) => {
		context.callbackWaitsForEmptyEventLoop = false
		callback(null, {
			'text': 'Something went wrong and we could not cast your vote'
		})
	})
}


function openVoting(event, name, context, callback) {
	openDB().then((db) => {
		return db.collection(`votes-${event.team_domain}`)
	}).then((collection) => {
		return collection.find({ name: name }).toArray().then((docs) => {
			if ( docs.length ) {
				return `You can not start a vote for an topic previously used`
			} else {
				return collection.find({ active: true }).toArray().then((docs) => {
					if ( docs.length ) {
						return `Voting is already open for: ${docs[0].name}, you can only have one topic open at a time`
					}
					return collection.insertOne({
						name: name,
						active: true
					}).then((object) => {
						return `Voting now open for ${name}`
					})
				})
			}
		})
	}).then((result) => {
		context.callbackWaitsForEmptyEventLoop = false
		callback(null, {
			'text': result
		})
	}).catch((err) => {
		context.callbackWaitsForEmptyEventLoop = false
		callback(null, {
			'text': 'Something went wrong and we could not open the voting'
		})
	})
}


function closeVoting(event, name, context, callback) {
	openDB().then((db) => {
		return db.collection(`votes-${event.team_domain}`)
	}).then((collection) => {
		return collection.find({ active: true }).toArray().then((docs) => {
			if ( !docs.length ) {
				context.callbackWaitsForEmptyEventLoop = false
				callback(null, {
					'text': `Voting has not been opened for: ${name}`
				})
			}

			return collection.findAndModify(
				{	active: true },
				{},
				{ $set: { active: false } },
				{ upsert: false }
			).then((object) => {
				if ( object.value.votes ) {
				let votes = sortObject(object.value.votes)[0]
					return {
						response_type: 'in_channel',
						text: `Voting now closed for ${name}`,
						attachments: [
							{
								title: 'Most Valuable Programmer',
								text: votes.key
							}
						]
					}
				} else {
					return {
						text: `Voting now closed for ${name}, not votes where made.`
					}
				}
			})

		})
	}).then((result) => {
		context.callbackWaitsForEmptyEventLoop = false
		callback(null, result)
	}).catch((err) => {
		console.log('Close Vote Error ', err)
		context.callbackWaitsForEmptyEventLoop = false
		callback(null, {
			'text': 'Something went wrong and we could not open the voting'
		})
	})
}


function sortObject(obj) {
	let arr = []
	let prop
	for ( prop in obj ) {
		if ( obj.hasOwnProperty(prop) ) {
			arr.push({
				'key': prop,
				'value': obj[prop]
			})
		}
	}
	arr.sort(function(a, b) {
		return b.value - a.value
	})
	return arr
}
