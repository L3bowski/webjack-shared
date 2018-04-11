var express = require('express');
var router = express.Router();
var path = require('path');
const uuidV4 = require('uuid/v4');
const tableService = require('./services/table-service');
const orchestrationService = require('./services/orchestration-service');

const corsMiddleware = (req, res, next) => {
	res.header("Access-Control-Allow-Origin", "http://localhost:8080");
	res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
	res.header("Access-Control-Allow-Credentials", "true");
	next();
};

const configureRouter = (middleware) => {

	const appMiddleware = [ middleware.session, corsMiddleware ];

	const noTableJoined = (res) =>
		res.status(400).send(JSON.stringify({message: "No table has been joined"}));

	const serializedTable = (res, table) => res.send(JSON.stringify({
		players: table.players,
		dealer: table.dealer,
		activePlayerId: table.activePlayerId,
		nextAction: table.nextAction
	}));

	router.get('/', function (req, res, next) {	
		return res.sendFile(path.join(__dirname, 'public', 'index.html'));
	});

	router.get('/is-player-registered', appMiddleware, function (req, res, next) {
		var playerId = req.session.playerId;
		var tableId = req.session.tableId;
		return res.send(JSON.stringify({ playerId, tableId }));
	});

	router.get('/register-player', appMiddleware, function (req, res, next) {
		var playerId = req.session.playerId;

		if (!playerId) {
			playerId = req.session.playerId = uuidV4();
			// TODO Check player name does not exist (and != Dealer). Check req.query.name exists
			req.session.playerName = req.query.name;
		}
		
		return res.send(JSON.stringify({ playerId }));
	});

	router.get('/join-table', appMiddleware, function (req, res, next) {
		var playerId = req.session.playerId;
		var playerName = req.session.playerName;
		var tableId = req.session.tableId = tableService.joinTable(playerId, playerName);
		return res.send(JSON.stringify({ tableId }));
	});

	router.get('/table-status', appMiddleware, function (req, res, next) {
		var table = tableService.getTable(req.session.tableId);
		if (!table) {
			return noTableJoined(res);
		}
		else {
			return serializedTable(res, table);
		}
	});

	router.get('/place-bet', appMiddleware, function (req, res, next) {
		var table = tableService.getTable(req.session.tableId);
		if (!table) {
			return noTableJoined(res);
		}
		else {
			orchestrationService.placeBet(table, req.session.playerId);
            return serializedTable(res, table);
		}
	});

	router.get('/make-decision', appMiddleware, function (req, res, next) {

		var playerId = req.session.playerId;
		var decision = req.query.decision;
		var table = tableService.getTable(req.session.tableId);
		if (!table) {
			return noTableJoined(res);
		}
		else {
			try {
				orchestrationService.makeDecision(table, playerId, decision);
				return serializedTable(res, table);
			}
            catch(exception) {
				return res.status(400).send(exception);
			}
		}
    });

	router.get('/exit-table', appMiddleware, function (req, res, next) {
		var playerId = req.session.playerId;
		var tableId = req.session.tableId;
		tableService.exitTable(tableId, playerId);
		delete req.session.tableId;
		return res.status(200).end();
	});

	return router;
}

module.exports = { configureRouter };
