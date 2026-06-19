import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:spa_shared/constants/app_colors.dart';
import 'package:spa_shared/widgets/loading_widget.dart';

class CustomerBookingScreen extends StatefulWidget {
  const CustomerBookingScreen({super.key});

  @override
  State<CustomerBookingScreen> createState() => _CustomerBookingScreenState();
}

class _CustomerBookingScreenState extends State<CustomerBookingScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Đặt lịch', style: GoogleFonts.playfairDisplay()),
        bottom: TabBar(
          controller: _tabController,
          labelColor: AppColors.primary,
          unselectedLabelColor: AppColors.textSecondary,
          indicatorColor: AppColors.primary,
          tabs: const [
            Tab(text: 'Đặt mới'),
            Tab(text: 'Lịch hẹn'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: const [
          _NewBookingTab(),
          _MyBookingsTab(),
        ],
      ),
    );
  }
}

class _NewBookingTab extends StatefulWidget {
  const _NewBookingTab();

  @override
  State<_NewBookingTab> createState() => _NewBookingTabState();
}

class _NewBookingTabState extends State<_NewBookingTab> {
  int _step = 0;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Stepper
          Row(
            children: [
              _StepIndicator(step: 1, label: 'Chi nhánh', isActive: _step >= 0, isCompleted: _step > 0),
              const Expanded(child: Divider()),
              _StepIndicator(step: 2, label: 'Dịch vụ', isActive: _step >= 1, isCompleted: _step > 1),
              const Expanded(child: Divider()),
              _StepIndicator(step: 3, label: 'KTV', isActive: _step >= 2, isCompleted: _step > 2),
              const Expanded(child: Divider()),
              _StepIndicator(step: 4, label: 'Thời gian', isActive: _step >= 3, isCompleted: _step > 3),
            ],
          ),
          const SizedBox(height: 24),

          // Step Content
          if (_step == 0) ...[
            Text('Chọn chi nhánh', style: GoogleFonts.inter(fontSize: 18, fontWeight: FontWeight.w600)),
            const SizedBox(height: 12),
            _BranchCard(name: 'Chi nhánh chính', address: 'Chưa có địa chỉ', isSelected: true, onTap: () => setState(() => _step = 1)),
          ],
          if (_step == 1) ...[
            Text('Chọn dịch vụ', style: GoogleFonts.inter(fontSize: 18, fontWeight: FontWeight.w600)),
            const SizedBox(height: 12),
            const EmptyStateWidget(
              icon: Icons.spa,
              title: 'Chưa có dịch vụ',
              message: 'Spa chưa thêm dịch vụ',
            ),
          ],
          if (_step == 2) ...[
            Text('Chọn kỹ thuật viên', style: GoogleFonts.inter(fontSize: 18, fontWeight: FontWeight.w600)),
            const SizedBox(height: 12),
            const EmptyStateWidget(
              icon: Icons.person,
              title: 'Chưa có kỹ thuật viên',
            ),
          ],
          if (_step == 3) ...[
            Text('Chọn thời gian', style: GoogleFonts.inter(fontSize: 18, fontWeight: FontWeight.w600)),
            const SizedBox(height: 12),
            // Calendar and time slots
          ],

          const SizedBox(height: 24),
          if (_step > 0)
            OutlinedButton(
              onPressed: () => setState(() => _step--),
              child: const Text('Quay lại'),
            ),
        ],
      ),
    );
  }
}

class _MyBookingsTab extends StatelessWidget {
  const _MyBookingsTab();

  @override
  Widget build(BuildContext context) {
    return const EmptyStateWidget(
      icon: Icons.calendar_today,
      title: 'Chưa có lịch hẹn',
      message: 'Đặt lịch để trải nghiệm dịch vụ tại Spa',
      actionLabel: 'Đặt lịch ngay',
    );
  }
}

class _StepIndicator extends StatelessWidget {
  final int step;
  final String label;
  final bool isActive;
  final bool isCompleted;

  const _StepIndicator({required this.step, required this.label, required this.isActive, required this.isCompleted});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          width: 32, height: 32,
          decoration: BoxDecoration(
            color: isCompleted ? AppColors.success : isActive ? AppColors.primary : AppColors.divider,
            shape: BoxShape.circle,
          ),
          child: Center(
            child: isCompleted
                ? const Icon(Icons.check, color: Colors.white, size: 18)
                : Text('$step', style: TextStyle(color: isActive ? Colors.white : AppColors.textSecondary, fontWeight: FontWeight.bold)),
          ),
        ),
        const SizedBox(height: 4),
        Text(label, style: TextStyle(fontSize: 10, color: isActive ? AppColors.textPrimary : AppColors.textSecondary)),
      ],
    );
  }
}

class _BranchCard extends StatelessWidget {
  final String name;
  final String address;
  final bool isSelected;
  final VoidCallback onTap;

  const _BranchCard({required this.name, required this.address, required this.isSelected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.primary.withValues(alpha: 0.05) : AppColors.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: isSelected ? AppColors.primary : AppColors.divider),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: AppColors.primary.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.business, color: AppColors.primary),
            ),
            const SizedBox(width: 16),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name, style: const TextStyle(fontWeight: FontWeight.w600)),
                Text(address, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
              ],
            ),
            const Spacer(),
            const Icon(Icons.chevron_right, color: AppColors.textSecondary),
          ],
        ),
      ),
    );
  }
}
