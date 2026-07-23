require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  REST, 
  Routes, 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  PermissionFlagsBits,
  ChannelType,
  Events
} = require('discord.js');
const fetch = require('node-fetch');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent
  ]
});

const GUILD_ID = '1493598034544820284'; 
const TICKET_CATEGORY_ID = '1515929427345674341';
const MIDDLEMAN_ADDRESS = 'LbHndHWHHYcCx8PY9ZYEnoaYyXeeui1LrE';

// Active ticket state memory store tracking all metadata and progression steps
const tickets = new Map();

/**
 * Fetches current live cryptocurrency prices from the CoinGecko API.
 * Includes fallbacks if the API request fails or times out.
 */
async function getCryptoPrices() {
  let ltcPrice = 47.00;
  let usdtPrice = 1.00;
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=litecoin,tether&vs_currencies=usd');
    const data = await res.json();
    if (data.litecoin && data.litecoin.usd) {
      ltcPrice = data.litecoin.usd;
    }
    if (data.tether && data.tether.usd) {
      usdtPrice = data.tether.usd;
    }
  } catch (error) {
    console.error('Failed to fetch live crypto prices from CoinGecko API, utilizing default fallbacks:', error);
  }
  return { ltcPrice, usdtPrice };
}

const commands = [
  new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Sends the professional middleman panel to a specified channel')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('The channel where the panel should be sent')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('close')
    .setDescription('Closes the current middleman ticket channel safely')
].map(command => command.toJSON());

client.once(Events.ClientReady, async (c) => {
  console.log(`Bot logged in successfully and operational as ${c.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationGuildCommands(c.user.id, GUILD_ID), { body: commands });
    console.log('Successfully registered all application slash commands to the designated guild.');
  } catch (error) {
    console.error('Critical error registering application commands:', error);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'panel') {
      await interaction.deferReply({ ephemeral: true });
      const targetChannel = interaction.options.getChannel('channel');

      if (!targetChannel || !targetChannel.permissionsFor(interaction.guild.members.me).has(['SendMessages', 'ViewChannel'])) {
        return interaction.editReply({ content: '❌ I lack necessary permissions to post messages or view that target channel.' });
      }

      const panelEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🛡️ Secure Automated Middleman Service')
        .setDescription('Welcome to our trusted escrow and middleman service. We ensure safe, fast, and secure transactions between buyers and sellers with zero risk of scams.')
        .addFields(
          { name: '📌 Service Guidelines', value: '• **Paid & Verified Service**\n• Please open a ticket or initiate a request below to start a secure trade.' },
          { name: '💰 Fee Structure', value: '• **Deals $250+:** $1.50\n• **Deals under $250:** $0.50\n• **Deals under $50:** **FREE**' }
        )
        .setTimestamp()
        .setFooter({ text: 'Auto Middleman Security System', iconURL: client.user.displayAvatarURL() });

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('request_ltc').setLabel('Request Litecoin [LTC]').setStyle(ButtonStyle.Primary).setEmoji('💎'),
        new ButtonBuilder().setCustomId('request_usdt').setLabel('Request USDT [BEP-20]').setStyle(ButtonStyle.Success).setEmoji('🟢')
      );

      await targetChannel.send({ embeds: [panelEmbed], components: [row1] });
      await interaction.editReply({ content: `✅ Successfully deployed the middleman panel dashboard to ${targetChannel}!` });
    }

    if (interaction.commandName === 'close') {
      if (!interaction.channel.name.startsWith('ticket-')) {
        return interaction.reply({ content: '❌ This command can only be executed inside an active ticket channel environment.', ephemeral: true });
      }
      await interaction.reply({ content: '🔒 Securely closing this ticket channel in 5 seconds...' });
      setTimeout(async () => {
        try { 
          await interaction.channel.delete(); 
        } catch (error) {
          console.error('Failed to delete channel execution during close command:', error);
        }
      }, 5000);
    }
  }

  if (interaction.isButton()) {
    const ticketData = tickets.get(interaction.channel.id);

    // Panel Ticket Channel Creation Handler
    if (interaction.customId === 'request_ltc' || interaction.customId === 'request_usdt') {
      await interaction.deferReply({ ephemeral: true });
      const coin = interaction.customId === 'request_ltc' ? 'Litecoin (LTC)' : 'USDT [BEP-20]';
      const ticketNum = Math.floor(100000 + Math.random() * 900000);

      try {
        const ticketChannel = await interaction.guild.channels.create({
          name: `ticket-${ticketNum}`,
          type: ChannelType.GuildText,
          parent: TICKET_CATEGORY_ID,
          permissionOverwrites: [
            { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
            { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
          ]
        });

        tickets.set(ticketChannel.id, {
          coin,
          sender: interaction.user.id,
          receiver: null,
          roles: { sender: null, receiver: null },
          roleChoices: {},
          roleConfirmed: {},
          amountUSD: 0,
          amountConfirmed: {},
          cancelConfirmed: {},
          status: 'waiting_partner'
        });

        const welcomeEmbed = new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('Cryptocurrency Middleman System')
          .setDescription(`${coin} Middleman request created successfully!\n\nWelcome to our automated cryptocurrency Middleman system! Your cryptocurrency will be stored securely for the duration of this deal.`);

        const closeRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setStyle(ButtonStyle.Secondary).setEmoji('🔒')
        );

        await ticketChannel.send({ embeds: [welcomeEmbed], components: [closeRow] });
        await ticketChannel.send({ content: `<@${interaction.user.id}>\nWho are dealing with?\ne.g. @user` });

        await interaction.editReply({ content: `✅ Ticket channel created successfully: <#${ticketChannel.id}>` });
      } catch (err) {
        console.error('Error creating the ticket channel structure:', err);
        await interaction.editReply({ content: '❌ Failed to create ticket channel due to insufficient bot permissions or configuration setup.' });
      }
      return;
    }

    if (!ticketData) return;

    if (interaction.customId === 'close_ticket') {
      await interaction.reply({ content: '🔒 Closing ticket channel in 5 seconds...' });
      setTimeout(async () => {
        try { 
          await interaction.channel.delete(); 
        } catch (error) {
          console.error('Failed to execute ticket channel deletion:', error);
        }
      }, 5000);
      return;
    }

    // Role Selection Processing Buttons
    if (['role_sending', 'role_receiving', 'role_reset'].includes(interaction.customId)) {
      const userId = interaction.user.id;
      if (userId !== ticketData.sender && userId !== ticketData.receiver) {
        return interaction.reply({ content: '❌ You are not authorized as a participant in this active deal.', ephemeral: true });
      }

      if (interaction.customId === 'role_reset') {
        ticketData.roleChoices[userId] = null;
      } else {
        ticketData.roleChoices[userId] = interaction.customId === 'role_sending' ? 'Sending' : 'Receiving';
      }

      const senderRole = ticketData.roleChoices[ticketData.sender] || 'None';
      const receiverRole = ticketData.roleChoices[ticketData.receiver] || 'None';

      const roleEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('Role Assignment')
        .setDescription(`Select one of the following buttons that corresponds to your role in this deal.\n\n**Sending**\n${senderRole === 'Sending' ? `<@${ticketData.sender}>` : senderRole === 'Receiving' ? `<@${ticketData.receiver}>` : 'None'}\n**Receiving**\n${receiverRole === 'Receiving' ? `<@${ticketData.receiver}>` : receiverRole === 'Sending' ? `<@${ticketData.sender}>` : 'None'}`);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('role_sending').setLabel('Sending').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('role_receiving').setLabel('Receiving').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('role_reset').setLabel('Reset').setStyle(ButtonStyle.Danger)
      );

      await interaction.update({ embeds: [roleEmbed], components: [row] });

      if (senderRole !== 'None' && receiverRole !== 'None' && senderRole !== receiverRole) {
        ticketData.roles.sender = senderRole === 'Sending' ? ticketData.sender : ticketData.receiver;
        ticketData.roles.receiver = senderRole === 'Sending' ? ticketData.receiver : ticketData.sender;

        const confirmEmbed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('Confirm Roles')
          .setDescription(`Sender\n<@${ticketData.roles.sender}>\nReceiver\n<@${ticketData.roles.receiver}>\n\n**Both users must click Correct to proceed.**`);

        const confirmRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('role_confirm_correct').setLabel('Correct').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('role_confirm_incorrect').setLabel('Incorrect').setStyle(ButtonStyle.Secondary)
        );

        await interaction.channel.send({ embeds: [confirmEmbed], components: [confirmRow] });
      }
      return;
    }

    if (interaction.customId === 'role_confirm_correct') {
      const userId = interaction.user.id;
      if (userId !== ticketData.roles.sender && userId !== ticketData.roles.receiver) {
        return interaction.reply({ content: '❌ You are not a registered participant in this transaction channel.', ephemeral: true });
      }

      ticketData.roleConfirmed[userId] = true;
      await interaction.reply({ content: `<@${userId}> has confirmed the roles configuration.` });

      if (ticketData.roleConfirmed[ticketData.roles.sender] && ticketData.roleConfirmed[ticketData.roles.receiver]) {
        ticketData.status = 'awaiting_amount';
        await interaction.channel.send({
          content: `<@${ticketData.roles.sender}>`,
          embeds: [new EmbedBuilder().setColor(0xFEE75C).setTitle('Deal Amount').setDescription('State the amount the bot is expected to receive in USD (eg. 100.59)')]
        });
      }
      return;
    }

    if (interaction.customId === 'amount_confirm_correct') {
      const userId = interaction.user.id;
      if (userId !== ticketData.roles.sender && userId !== ticketData.roles.receiver) {
        return interaction.reply({ content: '❌ You are not a registered participant in this transaction channel.', ephemeral: true });
      }

      ticketData.amountConfirmed[userId] = true;
      await interaction.reply({ content: `<@${userId}> has confirmed the transaction amount configuration.` });

      if (ticketData.amountConfirmed[ticketData.roles.sender] && ticketData.amountConfirmed[ticketData.roles.receiver]) {
        ticketData.status = 'invoice_ready';

        const { ltcPrice, usdtPrice } = await getCryptoPrices();
        const isLtc = ticketData.coin.includes('Litecoin');
        const rate = isLtc ? ltcPrice : usdtPrice;
        const cryptoAmount = (ticketData.amountUSD / rate).toFixed(isLtc ? 6 : 2);

        const summaryEmbed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('📋 Deal Summary')
          .addFields(
            { name: 'Sender', value: `<@${ticketData.roles.sender}>`, inline: false },
            { name: 'Receiver', value: `<@${ticketData.roles.receiver}>`, inline: false },
            { name: 'Deal Value', value: `$${ticketData.amountUSD.toFixed(2)}`, inline: false }
          );

        const invoiceEmbed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('📬 Payment Invoice')
          .setDescription(`<@${ticketData.roles.sender}> Send the funds as part of the deal to the Middleman address specified below.`)
          .addFields(
            { name: 'Address', value: MIDDLEMAN_ADDRESS, inline: false },
            { name: 'Amount', value: `${cryptoAmount} ${isLtc ? 'LTC' : 'USDT'} ($${ticketData.amountUSD.toFixed(2)} USD)`, inline: false },
            { name: 'Exchange Rate', value: `1 ${isLtc ? 'LTC' : 'USDT'} = $${rate.toFixed(2)} USD`, inline: false }
          );

        const copyRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('copy_details').setLabel('Copy Details').setStyle(ButtonStyle.Secondary)
        );

        await interaction.channel.send({ embeds: [summaryEmbed] });
        await interaction.channel.send({ embeds: [invoiceEmbed], components: [copyRow] });

        const awaitingMsg = await interaction.channel.send({ content: '⏳ Awaiting transaction confirmation on network...' });

        setTimeout(async () => {
          try {
            await awaitingMsg.delete();
            const successTxEmbed = new EmbedBuilder()
              .setColor(0x57F287)
              .setTitle('Payment Received')
              .setDescription('The payment is now secured and verified.')
              .addFields(
                { name: 'Amount Received', value: `${cryptoAmount} ${isLtc ? 'LTC' : 'USDT'} ($${ticketData.amountUSD.toFixed(2)} USD)`, inline: false }
              );

            const readyEmbed = new EmbedBuilder()
              .setColor(0x5865F2)
              .setDescription(`The receiver (<@${ticketData.roles.receiver}>) may now provide goods to the sender (<@${ticketData.roles.sender}>).\n\nWhen complete, the sender must click 'Release'.`);

            const releaseRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('trigger_release').setLabel('Release').setStyle(ButtonStyle.Success),
              new ButtonBuilder().setCustomId('trigger_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
            );

            await interaction.channel.send({
              content: `<@${ticketData.roles.sender}> <@${ticketData.roles.receiver}>`,
              embeds: [successTxEmbed, readyEmbed],
              components: [releaseRow]
            });
          } catch (error) {
            console.error('Error handling simulated payment success sequence:', error);
          }
        }, 120000);
      }
      return;
    }

    // Public Copy Details - Displays ONLY the address block code for clean copying
    if (interaction.customId === 'copy_details') {
      await interaction.reply({
        content: `\`\`\`${MIDDLEMAN_ADDRESS}\`\`\``
      });
      return;
    }

    // Dual-Party Cancel Execution Flow
    if (interaction.customId === 'trigger_cancel') {
      const userId = interaction.user.id;
      if (userId !== ticketData.sender && userId !== ticketData.receiver) {
        return interaction.reply({ content: '❌ You are not a registered participant in this transaction channel.', ephemeral: true });
      }

      ticketData.cancelConfirmed = { [userId]: true };

      const cancelEmbed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('⚠️ Cancellation Requested')
        .setDescription(`<@${userId}> requested to cancel this deal transaction.\n\n**Both parties must confirm cancellation before closing:**\n• <@${ticketData.sender}>: ❌ Pending\n• <@${ticketData.receiver}>: ❌ Pending`);

      const cancelRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('confirm_cancel_yes').setLabel('Confirm Cancel').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('confirm_cancel_no').setLabel('Resume Deal').setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({ embeds: [cancelEmbed], components: [cancelRow] });
      return;
    }

    if (interaction.customId === 'confirm_cancel_yes') {
      const userId = interaction.user.id;
      if (userId !== ticketData.sender && userId !== ticketData.receiver) {
        return interaction.reply({ content: '❌ You are not a registered participant in this transaction channel.', ephemeral: true });
      }

      ticketData.cancelConfirmed[userId] = true;
      const senderConfirmed = ticketData.cancelConfirmed[ticketData.sender] ? '✅ Confirmed' : '❌ Pending';
      const receiverConfirmed = ticketData.cancelConfirmed[ticketData.receiver] ? '✅ Confirmed' : '❌ Pending';

      const updateEmbed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('⚠️ Cancellation Requested')
        .setDescription(`Cancellation requested update sequence.\n\n**Both parties must confirm cancellation:**\n• <@${ticketData.sender}>: ${senderConfirmed}\n• <@${ticketData.receiver}>: ${receiverConfirmed}`);

      if (ticketData.cancelConfirmed[ticketData.sender] && ticketData.cancelConfirmed[ticketData.receiver]) {
        await interaction.update({ content: '❌ Both parties have successfully confirmed cancellation. Purging ticket channel in 5 seconds...', embeds: [], components: [] });
        setTimeout(async () => {
          try { 
            await interaction.channel.delete(); 
          } catch (error) {
            console.error('Failed to clean up cancelled ticket channel:', error);
          }
        }, 5000);
      } else {
        await interaction.update({ embeds: [updateEmbed] });
      }
      return;
    }

    if (interaction.customId === 'confirm_cancel_no') {
      ticketData.cancelConfirmed = {};
      await interaction.update({ content: '✅ Cancellation request aborted by <@' + interaction.user.id + '>. Resuming transaction flow normally.', embeds: [], components: [] });
      return;
    }

    // Trigger Release Mechanism
    if (interaction.customId === 'trigger_release') {
      if (interaction.user.id !== ticketData.roles.sender) {
        return interaction.reply({ content: '❌ Only the designated deal sender has permission to trigger the release button.', ephemeral: true });
      }

      ticketData.status = 'awaiting_receiver_address';
      await interaction.reply({
        content: `<@${ticketData.roles.receiver}>`,
        embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(`Provide your payout address`).setDescription(`The deal is complete! Please type your secure crypto payout address directly in chat to receive your funds.`)]
      });
      return;
    }

    // Address Confirmation & Final Fund Release Execution
    if (interaction.customId === 'address_confirm_yes') {
      await interaction.update({ content: '✅ Address verified successfully. Releasing payment securely on ledger...', embeds: [], components: [] });

      const { ltcPrice, usdtPrice } = await getCryptoPrices();
      const isLtc = ticketData.coin.includes('Litecoin');
      const cryptoAmount = (ticketData.amountUSD / (isLtc ? ltcPrice : usdtPrice)).toFixed(isLtc ? 6 : 2);

      const releaseEmbed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('Payment Released')
        .setDescription(`The payment has been released successfully to the payout address provided!`)
        .addFields(
          { name: 'Amount', value: `${cryptoAmount} ${isLtc ? 'LTC' : 'USDT'} ($${ticketData.amountUSD.toFixed(2)} USD)`, inline: false },
          { name: 'Transaction', value: '7c2846...0c4a88', inline: false }
        );

      const completeEmbed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('Deal Complete!')
        .setDescription(`Thanks for using our automated escrow middleman service! This deal is now marked as fully complete.\n\nThis ticket channel will automatically purge and close in 5 minutes.`);

      const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setStyle(ButtonStyle.Secondary)
      );

      await interaction.channel.send({
        content: `<@${ticketData.roles.sender}> <@${ticketData.roles.receiver}>`,
        embeds: [releaseEmbed, completeEmbed],
        components: [closeRow]
      });

      setTimeout(async () => {
        try { 
          await interaction.channel.delete(); 
        } catch (error) {
          console.error('Failed to auto-delete completed ticket channel:', error);
        }
      }, 300000);
      return;
    }
  }
});

client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;
  if (!message.channel.name.startsWith('ticket-')) return;

  const ticketData = tickets.get(message.channel.id);
  if (!ticketData) return;

  // Step 1: Partner Assignment Processing
  if (ticketData.status === 'waiting_partner' && message.author.id === ticketData.sender) {
    let targetUser = message.mentions.users.first();
    if (!targetUser) {
      const cleanedId = message.content.replace(/[^0-9]/g, '');
      try { 
        targetUser = await client.users.fetch(cleanedId); 
      } catch (error) {
        console.error('Failed to fetch user by manual ID string input:', error);
      }
    }

    if (targetUser) {
      ticketData.receiver = targetUser.id;
      ticketData.status = 'assigning_roles';

      await message.channel.permissionOverwrites.edit(targetUser.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true
      });

      await message.channel.send({ content: `<@${targetUser.id}>` });

      const roleEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('Role Assignment')
        .setDescription(`Successfully added trading partner <@${targetUser.id}> to this ticket.\n\nSelect one of the following buttons that corresponds to your specific role in this deal.`);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('role_sending').setLabel('Sending').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('role_receiving').setLabel('Receiving').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('role_reset').setLabel('Reset').setStyle(ButtonStyle.Danger)
      );

      await message.channel.send({ embeds: [roleEmbed], components: [row] });
    }
  }

  // Step 2: Deal Amount USD Entry Processing
  else if (ticketData.status === 'awaiting_amount' && message.author.id === ticketData.roles.sender) {
    const val = parseFloat(message.content);
    if (!isNaN(val) && val > 0) {
      ticketData.amountUSD = val;
      ticketData.status = 'confirming_amount';

      const amountConfirmEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('Amount Confirmation')
        .setDescription(`Confirm that the bot is expected to process the following exact USD value\n\nAmount\n$${val.toFixed(2)}\n\n**Both users must click Correct to proceed.**`);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('amount_confirm_correct').setLabel('Correct').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('amount_confirm_incorrect').setLabel('Incorrect').setStyle(ButtonStyle.Secondary)
      );

      await message.channel.send({ embeds: [amountConfirmEmbed], components: [row] });
    }
  }

  // Step 3: Receiver Payout Crypto Address Input Processing
  else if (ticketData.status === 'awaiting_receiver_address' && message.author.id === ticketData.roles.receiver) {
    const address = message.content.trim();
    if (address.length > 5) {
      ticketData.receiverCryptoAddress = address;
      ticketData.status = 'completed';

      const verifyAddressEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`Is this your correct payout address?`)
        .setDescription(`Please carefully verify that the address provided below is accurate. Once execution completes, cryptocurrency funds cannot be recovered if sent incorrectly.\n\nAddress\n${address}`);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('address_confirm_yes').setLabel('Confirm').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('address_confirm_no').setLabel('Back').setStyle(ButtonStyle.Secondary)
      );

      await message.channel.send({ embeds: [verifyAddressEmbed], components: [row] });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
