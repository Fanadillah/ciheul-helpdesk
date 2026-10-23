import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/app_state.dart';
import '../core/models.dart';
import '../core/theme.dart';

class NewTicketScreen extends StatefulWidget {
  final AppState state;

  const NewTicketScreen({super.key, required this.state});

  @override
  State<NewTicketScreen> createState() => _NewTicketScreenState();
}

class _NewTicketScreenState extends State<NewTicketScreen> {
  final _formKey = GlobalKey<FormState>();
  final _subject = TextEditingController();
  final _description = TextEditingController();
  String? _categoryId;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    if (widget.state.categories.isEmpty) {
      widget.state.refreshCategories();
    } else {
      _categoryId = widget.state.categories.first.id;
    }
  }

  @override
  void dispose() {
    _subject.dispose();
    _description.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    if (!(_formKey.currentState?.validate() ?? false)) return;
    if (_categoryId == null) {
      setState(() => _error = 'Pilih kategori terlebih dahulu.');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final Ticket ticket = await widget.state.createTicket(
        subject: _subject.text.trim(),
        description: _description.text.trim(),
        categoryId: _categoryId!,
      );
      if (mounted) Navigator.of(context).pop(ticket);
    } on ApiException catch (err) {
      setState(() => _error = err.message);
    } catch (_) {
      setState(() => _error = 'Tiket gagal dibuat. Coba lagi.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final categories = widget.state.categories;
    if (_categoryId == null && categories.isNotEmpty) {
      _categoryId = categories.first.id;
    }
    final selected = categories.where((c) => c.id == _categoryId).toList();
    final category = selected.isEmpty ? null : selected.first;

    return Scaffold(
      appBar: AppBar(title: const Text('Buat Tiket Baru')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: const Color(0xFFEFF6FF),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: const Color(0xFFBFDBFE)),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.support_agent_rounded, color: AppColors.primary, size: 22),
                    SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Jelaskan kendala Anda sedetail mungkin agar tim support dapat membantu lebih cepat.',
                        style: TextStyle(fontSize: 12, color: Color(0xFF1E40AF), height: 1.5),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 18),
              const _Label('Kategori'),
              const SizedBox(height: 6),
              DropdownButtonFormField<String>(
                initialValue: _categoryId,
                decoration: const InputDecoration(hintText: 'Pilih kategori'),
                items: categories
                    .map(
                      (c) => DropdownMenuItem<String>(
                        value: c.id,
                        child: Text(c.name, style: const TextStyle(fontSize: 13.5)),
                      ),
                    )
                    .toList(),
                onChanged: (value) => setState(() => _categoryId = value),
              ),
              if (category != null) ...[
                const SizedBox(height: 6),
                Text(
                  'SLA: respon ${category.firstResponseMin} menit · resolusi ${category.resolutionMin} menit',
                  style: const TextStyle(fontSize: 10.5, color: AppColors.soft),
                ),
              ],
              const SizedBox(height: 16),
              const _Label('Subjek'),
              const SizedBox(height: 6),
              TextFormField(
                controller: _subject,
                maxLength: 160,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  hintText: 'Ringkasan singkat kendala',
                  counterText: '',
                ),
                validator: (value) {
                  if ((value ?? '').trim().length < 3) return 'Subjek minimal 3 karakter';
                  return null;
                },
              ),
              const SizedBox(height: 16),
              const _Label('Deskripsi'),
              const SizedBox(height: 6),
              TextFormField(
                controller: _description,
                maxLines: 7,
                maxLength: 4000,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  hintText: 'Ceritakan kronologi, pesan error, atau langkah yang sudah dicoba...',
                  alignLabelWithHint: true,
                ),
                validator: (value) {
                  if ((value ?? '').trim().length < 5) return 'Deskripsi minimal 5 karakter';
                  return null;
                },
              ),
              if (_error != null) ...[
                const SizedBox(height: 10),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 9),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFEF2F2),
                    borderRadius: BorderRadius.circular(9),
                    border: Border.all(color: const Color(0xFFFECACA)),
                  ),
                  child: Text(_error!, style: const TextStyle(fontSize: 12, color: Color(0xFFB91C1C))),
                ),
              ],
              const SizedBox(height: 20),
              SizedBox(
                height: 48,
                child: FilledButton.icon(
                  onPressed: _submitting || categories.isEmpty ? null : _submit,
                  icon: _submitting
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : const Icon(Icons.send_rounded, size: 18),
                  label: const Text('Kirim tiket'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Label extends StatelessWidget {
  final String text;
  const _Label(this.text);

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: Color(0xFF334155)),
    );
  }
}
