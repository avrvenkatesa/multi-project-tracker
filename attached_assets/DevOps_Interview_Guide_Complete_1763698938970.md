# DevOps Engineer Interview Guide - Complete
## Pathfinder Modernization Project
### S4Carlisle Publishing Services

This comprehensive guide contains hands-on exercises with solutions, interview questions with model answers, and scoring rubrics for evaluating DevOps candidates for the Pathfinder modernization project.

---

## Document Overview

**Purpose**: Evaluate DevOps candidates for mission-critical cloud migration
**Target Role**: AWS DevOps Engineer with Terraform, CI/CD, and migration experience
**Project Context**: Pathfinder platform migration from on-premises to AWS
**Timeline**: December 6, 2025 production cutover

**Contents**:
1. Hands-On Exercises (3-4 hours)
2. Exercise Solutions with Best Practices
3. Technical Interview Questions (20 questions)
4. Model Answers for Each Question
5. Scoring Guidelines and Rubrics

---

# PART 1: HANDS-ON EXERCISES

## Exercise Overview
**Duration**: 3-4 hours total
**Format**: Take-home or supervised
**Scoring**: 40 points (see rubric at end)

### Scenario Background

S4Carlisle Publishing Services is migrating Pathfinder (mission-critical publishing platform) from on-premises to AWS:

**Current Environment**:
- 2x Windows Server 2008 R2 Domain Controllers
- MySQL 5.1 (50GB, ~500 transactions/hour peak)
- PHP 5.6 application on Apache
- Windows file server (2TB, 50 concurrent users)
- Linux SFTP server (500GB/day transfers)
- Network: 10.0.0.0/16 on-premises

**Requirements**:
- Zero downtime migration
- December 6-8, 2025 cutover window
- 99.9% SLA post-migration
- AWS ap-south-1 (Mumbai) region
- Budget: ₹5.2L/month operational cost

---

## Exercise 1: Architecture Design (60 minutes)

**Task**: Design complete AWS migration architecture

**Requirements**:
1. Network Design (VPC, subnets, routing, no overlap with 10.0.0.0/16)
2. Compute Strategy (EC2 sizing, Auto Scaling, load balancing)
3. Database Migration (MySQL 5.1 → RDS with zero downtime)
4. Storage Solutions (File server and SFTP replacement)
5. Zero-Downtime Cutover Plan with rollback procedures

**Deliverable**: Architecture diagram + 3-4 page written explanation

**Key Evaluation Criteria**:
- Proper Multi-AZ design
- Security best practices (encryption, least privilege)
- Cost optimization while meeting requirements
- Detailed cutover timeline with validation checkpoints

---

## Exercise 2: Infrastructure as Code (90 minutes)

**Task**: Write Terraform code for core infrastructure

**Requirements**:

Create modules for:
1. **Network Module**:
   - VPC (172.16.0.0/16)
   - 2 public subnets across 2 AZs
   - 2 private app subnets
   - 2 private DB subnets
   - NAT Gateways, Internet Gateway
   - Route tables

2. **Security Groups**:
   - ALB (allow 80/443 from internet)
   - App tier (allow from ALB, RDP from bastion)
   - DB tier (allow 3306 from app tier)
   - Bastion (allow RDP/SSH from office IP)

3. **RDS MySQL**:
   - MySQL 5.7 or 8.0
   - Multi-AZ deployment
   - Automated backups (7 days)
   - Parameter group optimizations
   - Secrets Manager for credentials

4. **Application Load Balancer + Auto Scaling**:
   - ALB with HTTPS listener
   - Target group with health checks
   - Launch template
   - ASG (min:2, max:4, desired:2)

**Code Standards**:
- Use modules for reusability
- Variables for all configurable parameters
- Outputs for important resource IDs
- Remote state configuration (S3 + DynamoDB locking)
- Proper tagging (Project, Environment, CostCenter)

**Deliverable**: Git repository with organized Terraform code

---

## Exercise 3: CI/CD Pipeline (60 minutes)

**Task**: Create Jenkinsfile for infrastructure deployment

**Pipeline Stages**:
1. Checkout (verify branch)
2. Initialize (terraform init)
3. Validate & Lint (terraform validate, fmt, tflint)
4. Security Scan (checkov or tfsec)
5. Plan (terraform plan -out=tfplan)
6. Approval Gate (manual for production)
7. Apply (terraform apply tfplan)
8. Smoke Tests (verify ALB, RDS, application health)
9. Notify (Slack/email on success/failure)

**Requirements**:
- Declarative pipeline syntax
- Proper error handling
- Rollback capability
- Environment parameterization (dev/staging/prod)
- Plan artifacts saved for review

**Deliverable**: Jenkinsfile + rollback runbook

---

## Exercise 4: Troubleshooting (30 minutes)

**Scenario**: After test cutover, you discover:

**Issue 1**: Performance Degradation
- On-premises: 200ms response time
- AWS: 2000ms response time (10x slower)
- Database CPU: 85% (was 45% on-prem)
- Application CPU: 35%

**Issue 2**: Intermittent Connection Failures
- "Connection timed out" errors
- 10-15 occurrences per hour
- More frequent during peak hours (9-11 AM IST)

**Issue 3**: File Access Delays  
- File operations: 1-2 seconds → 10-15 seconds
- Particularly affects large files (>100MB)
- Editors report timeout errors

**Tasks**:
1. List 3-5 potential root causes for each issue
2. Provide specific diagnostic commands/tools
3. Propose prioritized solutions with time estimates
4. Identify what should have been done differently

**Deliverable**: Troubleshooting document (2-3 pages)

---

# PART 2: MODEL SOLUTIONS

## Solution 1: Architecture Design

### Network Design

**IP Addressing**:
```
On-Premises: 10.0.0.0/16
AWS VPC:     172.16.0.0/16

Subnets:
- Public (ap-south-1a): 172.16.1.0/24
- Public (ap-south-1b): 172.16.2.0/24
- Private-App (1a): 172.16.11.0/24
- Private-App (1b): 172.16.12.0/24
- Private-DB (1a): 172.16.21.0/24
- Private-DB (1b): 172.16.22.0/24
```

**Key Design Decisions**:
- Multi-AZ for HA (99.9% SLA requirement)
- Separate DB tier for security (no internet access)
- NAT Gateways in each AZ (avoid cross-AZ charges)
- VPN for hybrid connectivity during migration

### Database Migration Strategy

**Approach**: AWS DMS with phased migration

**Phase 1 - Preparation (Week 1-2)**:
1. Upgrade MySQL 5.1 → 5.5 on-premises (DMS requirement)
2. Enable binary logging (binlog_format=ROW)
3. Provision RDS MySQL 5.7 (db.r5.large, Multi-AZ)

**Phase 2 - Initial Load (Week 3)**:
1. Create DMS replication instance (dms.c5.xlarge)
2. Full load migration (6-8 hours for 50GB)
3. Data validation (row counts, checksums)

**Phase 3 - CDC Replication (Week 4 - Cutover)**:
1. Enable Change Data Capture
2. Monitor replication lag (target: <60 seconds)
3. Run parallel: on-prem (read-write), RDS (read-only)

**Phase 4 - Cutover (December 6-8)**:
- Friday 9:00 PM: Enable read-only on on-premises
- Friday 9:30 PM: Wait for lag=0, verify data consistency
- Friday 10:00 PM: Update connection strings to RDS
- Friday 10:30 PM: Remove read-only, intensive monitoring

**Rollback**: If issues within 4 hours, revert connection strings (5 min RTO)

### Storage Solutions

**File Server**: Amazon FSx for Windows File Server
- Capacity: 2TB SSD
- Throughput: 256 MB/s (upgradeable to 512)
- Multi-AZ deployment
- AD integration via AWS Managed Microsoft AD
- Cost: ~₹73,000/month

**SFTP**: AWS Transfer Family
- SFTP over VPC endpoint
- S3 backend storage
- AD authentication
- Lifecycle policies (S3 → Glacier after 90 days)
- Cost: ~₹46,000/month

---

## Solution 2: Terraform Code

### Module Structure
```
terraform-pathfinder/
├── modules/
│   ├── network/
│   ├── compute/
│   ├── database/
│   └── security/
└── environments/
    ├── dev/
    ├── staging/
    └── production/
```

### Network Module Example

```hcl
# modules/network/main.tf
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true
  
  tags = merge(var.common_tags, {
    Name = "${var.project_name}-vpc"
  })
}

resource "aws_subnet" "public" {
  count             = length(var.public_subnet_cidrs)
  vpc_id            = aws_vpc.main.id
  cidr_block        = var.public_subnet_cidrs[count.index]
  availability_zone = var.availability_zones[count.index]
  
  map_public_ip_on_launch = true
  
  tags = merge(var.common_tags, {
    Name = "${var.project_name}-public-${var.availability_zones[count.index]}"
  })
}

resource "aws_nat_gateway" "main" {
  count         = length(var.availability_zones)
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id
}
```

### Database Module Example

```hcl
# modules/database/main.tf
resource "random_password" "master" {
  length  = 32
  special = true
}

resource "aws_secretsmanager_secret" "db_password" {
  name       = "${var.project_name}/db/master-password"
  kms_key_id = var.kms_key_id
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id = aws_secretsmanager_secret.db_password.id
  secret_string = jsonencode({
    username = var.master_username
    password = random_password.master.result
    host     = aws_db_instance.main.endpoint
    port     = 3306
  })
}

resource "aws_db_instance" "main" {
  identifier     = "${var.project_name}-mysql"
  engine         = "mysql"
  engine_version = "5.7.44"
  instance_class = var.instance_class
  
  multi_az               = var.multi_az
  storage_encrypted      = true
  kms_key_id            = var.kms_key_id
  
  username = var.master_username
  password = random_password.master.result
  
  backup_retention_period = 7
  backup_window          = "02:00-03:00"
  
  enabled_cloudwatch_logs_exports = ["error", "general", "slowquery"]
}
```

### Environment Configuration

```hcl
# environments/production/main.tf
module "network" {
  source = "../../modules/network"
  
  project_name         = "pathfinder"
  vpc_cidr            = "172.16.0.0/16"
  availability_zones  = ["ap-south-1a", "ap-south-1b"]
  
  common_tags = local.common_tags
}

module "database" {
  source = "../../modules/database"
  
  project_name    = "pathfinder"
  instance_class  = "db.r5.large"
  multi_az        = true
  
  subnet_ids         = module.network.private_db_subnet_ids
  security_group_ids = [module.security.database_sg_id]
  kms_key_id         = aws_kms_key.rds.arn
}
```

---

## Solution 3: CI/CD Pipeline

```groovy
pipeline {
    agent { label 'terraform' }
    
    parameters {
        choice(name: 'ENVIRONMENT', choices: ['dev', 'staging', 'production'])
        choice(name: 'ACTION', choices: ['plan', 'apply', 'destroy'])
    }
    
    environment {
        TF_DIR = "environments/${params.ENVIRONMENT}"
    }
    
    stages {
        stage('Checkout') {
            steps {
                checkout scm
                script {
                    if (params.ENVIRONMENT == 'production' && env.BRANCH_NAME != 'main') {
                        error "Production must deploy from main branch"
                    }
                }
            }
        }
        
        stage('Initialize') {
            steps {
                dir(env.TF_DIR) {
                    sh 'terraform init -upgrade'
                }
            }
        }
        
        stage('Validate & Lint') {
            parallel {
                stage('Validate') {
                    steps {
                        dir(env.TF_DIR) {
                            sh 'terraform validate'
                        }
                    }
                }
                stage('Format Check') {
                    steps {
                        sh 'terraform fmt -check -recursive'
                    }
                }
                stage('TFLint') {
                    steps {
                        sh 'tflint --recursive'
                    }
                }
            }
        }
        
        stage('Security Scan') {
            steps {
                sh '''
                    checkov -d . --compact --quiet
                    tfsec . --minimum-severity HIGH
                '''
            }
        }
        
        stage('Plan') {
            when { expression { params.ACTION != 'destroy' } }
            steps {
                dir(env.TF_DIR) {
                    sh 'terraform plan -out=tfplan'
                    archiveArtifacts 'tfplan'
                }
            }
        }
        
        stage('Approval') {
            when { 
                allOf {
                    expression { params.ACTION == 'apply' }
                    expression { params.ENVIRONMENT == 'production' }
                }
            }
            steps {
                timeout(time: 30, unit: 'MINUTES') {
                    input message: 'Apply to production?', ok: 'Deploy'
                }
            }
        }
        
        stage('Apply') {
            when { expression { params.ACTION == 'apply' } }
            steps {
                dir(env.TF_DIR) {
                    sh 'terraform apply -auto-approve tfplan'
                }
            }
        }
        
        stage('Smoke Tests') {
            when { expression { params.ACTION == 'apply' } }
            steps {
                sh './scripts/smoke-tests.sh'
            }
        }
    }
    
    post {
        failure {
            slackSend color: 'danger', message: "Pipeline FAILED: ${env.JOB_NAME}"
        }
    }
}
```

**Rollback Procedure**:
1. Identify last good state from S3 versioning
2. Restore previous terraform.tfstate
3. Checkout previous git commit
4. Run `terraform apply` with previous configuration
5. Verify rollback with smoke tests

---

## Solution 4: Troubleshooting

### Issue 1: Performance Degradation (2000ms response time)

**Root Causes (Prioritized)**:
1. **Database bottleneck** (90% probability)
   - Missing indexes after migration
   - innodb_buffer_pool_size too small
   - No connection pooling
   
2. **Network latency** (70% probability)
   - Cross-AZ traffic overhead
   - NAT Gateway bottleneck

3. **Instance throttling** (30% probability)
   - t3 burst credits exhausted

**Diagnostic Commands**:
```sql
-- Connect to RDS
mysql -h pathfinder-mysql.xxx.rds.amazonaws.com -u admin -p

-- Check slow queries
SELECT query, exec_count, avg_latency
FROM sys.statement_analysis 
WHERE avg_latency > '00:00:01'
ORDER BY avg_latency DESC LIMIT 10;

-- Check for missing indexes
SELECT object_schema, object_name
FROM performance_schema.table_io_waits_summary_by_index_usage
WHERE index_name IS NULL AND count_star > 100;

-- Check buffer pool hit rate
SHOW ENGINE INNODB STATUS\G
```

```bash
# Check CloudWatch metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name CPUUtilization \
  --dimensions Name=DBInstanceIdentifier,Value=pathfinder-mysql \
  --start-time 2025-12-06T14:00:00Z \
  --end-time 2025-12-06T16:00:00Z \
  --period 300 --statistics Average
```

**Solutions (Prioritized)**:

**1. Add Missing Indexes (IMMEDIATE - 30 min)**
```sql
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_tasks_project ON tasks(project_id);
ANALYZE TABLE projects, tasks;
```
- Risk: LOW
- Impact: 5-10x query speedup
- Time: 30 minutes

**2. Increase Buffer Pool (IMMEDIATE - 10 min + reboot)**
```bash
aws rds modify-db-parameter-group \
  --db-parameter-group-name pathfinder-params \
  --parameters "ParameterName=innodb_buffer_pool_size,ParameterValue={DBInstanceClassMemory*3/4}"
```
- Risk: MEDIUM (requires reboot)
- Impact: Better caching, reduced I/O
- Time: 10 min + 5 min downtime

**3. Implement Connection Pooling (1 hour)**
```php
// Application code
class DatabasePool {
    private static $connections = [];
    private static $maxConnections = 20;
    
    public static function getConnection() {
        foreach (self::$connections as $conn) {
            if ($conn->ping()) return $conn;
        }
        if (count(self::$connections) < self::$maxConnections) {
            $conn = new mysqli('p:'.DB_HOST, DB_USER, DB_PASS, DB_NAME);
            self::$connections[] = $conn;
            return $conn;
        }
    }
}
```
- Risk: LOW
- Impact: 200-500ms reduction
- Time: 1 hour

**Expected Improvement**: 2000ms → 300ms (85% improvement)

### Issue 2: Intermittent Connection Failures

**Root Causes**:
1. **Connection pool exhaustion** (85%)
2. **Security group timeout** (70%)
3. **NAT Gateway port exhaustion** (50%)

**Solutions**:
1. Increase RDS max_connections from 300 to 500
2. Implement TCP keepalive in application
3. Add connection retry logic with exponential backoff

### Issue 3: File Access Delays

**Root Causes**:
1. **FSx throughput insufficient** (90%)
2. **VPN bandwidth limitation** (70%)
3. **SMB negotiation issues** (50%)

**Solutions**:
1. Upgrade FSx throughput from 256 MB/s to 512 MB/s
2. Enable SMB multichannel on clients
3. Consider Direct Connect for sustained high throughput

**Prevention**:
- Performance baseline testing before migration
- Load testing with production-like volumes
- Monitor key metrics during test cutover
- Gradual rollout (10% → 25% → 100% of users)

---

# PART 3: INTERVIEW QUESTIONS & MODEL ANSWERS

## Technical Questions

### Q1: MySQL Migration with Zero Downtime

**Question**: Walk me through migrating MySQL 5.1 to AWS with zero downtime.

**Model Answer**:

"I'd use AWS DMS with a phased approach:

**Phase 1: Preparation**
- Upgrade 5.1 → 5.5 on-premises (DMS doesn't support 5.1)
- Enable binary logging with binlog_format=ROW
- Provision RDS MySQL 5.7 with Multi-AZ

**Phase 2: Initial Load**
- Create DMS replication instance (dms.c5.xlarge)
- Full load migration (6-8 hours for 50GB)
- Validate data consistency

**Phase 3: CDC Replication**
- Enable Change Data Capture
- Monitor replication lag (<60 seconds target)
- On-prem remains primary (read-write)

**Phase 4: Cutover**
- Put on-prem in read-only mode
- Wait for lag=0
- Update application connection strings
- Remove read-only from RDS
- Monitor intensively for 4 hours

**Rollback Plan**:
If issues within 4 hours, revert connection strings (5-minute RTO).

**Why This Works**:
- DMS handles replication automatically
- Multiple validation checkpoints
- Clear rollback procedure
- Minimal user impact"

---

### Q2: Terraform Multi-Environment Strategy

**Question**: How do you structure Terraform for dev/staging/production while maintaining DRY principles?

**Model Answer**:

"I use separate state files with shared modules:

**Directory Structure**:
```
terraform-pathfinder/
├── modules/           # Reusable components
│   ├── network/
│   ├── compute/
│   └── database/
└── environments/      # Environment-specific
    ├── dev/
    ├── staging/
    └── production/
```

**Key Principles**:

1. **Separate State Files**:
```hcl
# backend.tf (different key per environment)
terraform {
  backend "s3" {
    bucket = "pathfinder-terraform-state"
    key    = "production/terraform.tfstate"  # Changes per env
    region = "ap-south-1"
    encrypt = true
    dynamodb_table = "pathfinder-terraform-locks"
  }
}
```

2. **Shared Modules**:
```hcl
# environments/production/main.tf
module "database" {
  source = "../../modules/database"
  
  instance_class = "db.r5.large"  # Different per env
  multi_az       = true            # true in prod, false in dev
}
```

3. **Environment-Specific Variables**:
```hcl
# dev/terraform.tfvars
instance_class = "db.t3.medium"
multi_az       = false
deletion_protection = false

# production/terraform.tfvars
instance_class = "db.r5.large"
multi_az       = true
deletion_protection = true
```

**Why Separate States**:
- Isolation (dev changes don't affect prod)
- Security (different IAM permissions)
- Safety (can't accidentally destroy prod)
- Blast radius containment

**Alternatives Considered**:
- Workspaces: NOT recommended (single state file, easy mistakes)
- Terragrunt: Overkill for this scale

**Benefits**:
- Clear separation
- Module reusability
- Environment-specific customization
- Team collaboration"

---

### Q3: Secrets Management in Terraform

**Question**: How do you handle secrets in Terraform securely?

**Model Answer**:

"I use AWS Secrets Manager with specific Terraform patterns:

**The Problem**:
Terraform state files are plain JSON and store ALL resource attributes including passwords.

**Solution**:

```hcl
# 1. Generate password (never type it)
resource "random_password" "db_master" {
  length  = 32
  special = true
}

# 2. Store in Secrets Manager
resource "aws_secretsmanager_secret" "db_password" {
  name       = "pathfinder/db/master-password"
  kms_key_id = aws_kms_key.secrets.id
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id = aws_secretsmanager_secret.db_password.id
  secret_string = jsonencode({
    username = "admin"
    password = random_password.db_master.result
    host     = aws_db_instance.main.endpoint
  })
}

# 3. Use in RDS
resource "aws_db_instance" "main" {
  password = random_password.db_master.result
}

# 4. Application retrieves at runtime (not in Terraform)
```

**State File Security**:
```hcl
terraform {
  backend "s3" {
    bucket     = "pathfinder-terraform-state"
    encrypt    = true  # Server-side encryption
    kms_key_id = "arn:aws:kms:..."  # Custom KMS key
  }
}
```

**IAM for Application**:
```hcl
resource "aws_iam_role_policy" "app_secrets" {
  policy = jsonencode({
    Statement = [{
      Effect = "Allow"
      Action = ["secretsmanager:GetSecretValue"]
      Resource = aws_secretsmanager_secret.db_password.arn
    }]
  })
}
```

**NEVER Do**:
- Store passwords in terraform.tfvars
- Hardcode secrets in .tf files
- Use environment variables for production
- Commit secrets to git

**Why This Works**:
- Secrets generated, not typed
- Encrypted at rest (KMS)
- Application retrieves at runtime
- Audit trail (CloudTrail)
- Rotation capability

**Additional Security**:
- Enable versioning on state bucket
- Restrict state bucket access (IAM)
- Block public access
- Enable automatic rotation (30 days)"

---

### Q4: CI/CD Testing Strategy for Terraform

**Question**: How would you implement testing for Terraform infrastructure code?

**Model Answer**:

"I implement a multi-layered testing pyramid:

**Layer 1: Static Analysis (Every Commit)**
```bash
# Pre-commit hooks
terraform fmt -check -recursive
terraform validate
tflint --recursive
```

**Layer 2: Security Scanning (Every PR)**
```bash
# Checkov for security issues
checkov -d . --compact --quiet

# tfsec for AWS-specific checks
tfsec . --minimum-severity HIGH
```

**Layer 3: Policy as Code (Before Apply)**
```rego
# OPA policy example
package terraform.policies

deny[msg] {
    resource := input.resource_changes[_]
    resource.type == "aws_db_instance"
    input.variables.environment == "production"
    resource.change.after.multi_az != true
    msg = "RDS must be Multi-AZ in production"
}
```

**Layer 4: Integration Testing (Staging)**
```go
// Terratest example
func TestNetworkModule(t *testing.T) {
    terraformOptions := &terraform.Options{
        TerraformDir: "../modules/network",
    }
    
    defer terraform.Destroy(t, terraformOptions)
    terraform.InitAndApply(t, terraformOptions)
    
    vpcID := terraform.Output(t, terraformOptions, "vpc_id")
    vpc := aws.GetVpcById(t, vpcID, "ap-south-1")
    
    assert.Equal(t, "172.16.0.0/16", vpc.CidrBlock)
}
```

**Layer 5: Smoke Tests (After Deployment)**
```bash
#!/bin/bash
# Verify deployed infrastructure

# Test ALB
curl -f https://pathfinder.s4carlisle.com/health.php

# Test database connectivity
mysql -h $DB_ENDPOINT -u admin -p$DB_PASS -e "SELECT 1"

# Verify ASG health
aws autoscaling describe-auto-scaling-groups \
  --query 'AutoScalingGroups[0].Instances[?HealthStatus==`Healthy`] | length(@)'
```

**Complete CI/CD Pipeline**:
```groovy
pipeline {
    stages {
        stage('Static Analysis') { /* fmt, validate, lint */ }
        stage('Security Scan')   { /* checkov, tfsec */ }
        stage('Plan')            { /* terraform plan */ }
        stage('Policy Check')    { /* OPA evaluation */ }
        stage('Approval')        { /* manual gate */ }
        stage('Apply')           { /* terraform apply */ }
        stage('Smoke Tests')     { /* verify deployment */ }
    }
}
```

**Why This Works**:
- Catches issues early (fail fast)
- Multiple validation layers
- Automated and repeatable
- Provides confidence before production

**Cost Control**:
```bash
# Estimate costs with Infracost
infracost breakdown --path . --format json
```

**What Tests Don't Cover**:
- Performance under load (need separate load testing)
- Operational behavior (need monitoring)
- Disaster recovery (need DR drills)"

---

## Behavioral Questions

### Q5: Migration Failure Response

**Question**: Tell me about a time when a deployment went wrong.

**Model Answer**:

"I was leading a PostgreSQL database migration where we discovered replication lag increasing exponentially during cutover (from 5 seconds to 15 minutes).

**What Happened**:
- DMS replication instance was CPU-bound
- Production had 10x more write volume than staging
- We were 4 hours into a planned weekend migration

**My Response**:

1. **Immediate Assessment** (6:00 AM)
   - Called emergency meeting
   - Presented options with trade-offs
   - Set hard abort deadline (11:00 AM)

2. **Root Cause** (6:15-7:00 AM)
   - DMS processing large BLOBs sequentially
   - Instance undersized for write throughput

3. **Decision** (7:00 AM)
   - Chose to put product catalog in read-only mode for 3 hours
   - Got executive approval (woke up VP)
   - Preserved progress while reducing load

4. **Execution** (7:30-10:30 AM)
   - Implemented read-only mode
   - Lag decreased: 15 min → 0 sec
   - Validated data consistency

5. **Cutover** (10:30 AM)
   - Updated connection strings
   - Monitored for 2 hours
   - Back to normal by Monday 9 AM

**Outcome**:
- 7 hours late but successful
- No data loss or customer impact
- Business inconvenienced but not down

**What I Learned**:

1. **Test at Production Scale**: Staging had only 10% of prod volume. Now I test at 2x expected load.

2. **Size for Throughput, Not Data**: DMS sizing was based on database size (50GB), not transactions/second.

3. **Have Degradation Options**: We had rollback (Plan B) but no intermediate options like read-only mode.

4. **Communication is Critical**: Stakeholders appreciated transparency. Bad news early is better than surprises.

5. **Define Abort Criteria**: We set 11 AM as hard deadline before starting.

**Application to Pathfinder**:

For this migration, I'd:
- Test DMS with 1,200 transactions/hour (Pathfinder's peak)
- Size DMS at dms.c5.xlarge minimum
- Identify which Pathfinder functions can be read-only
- Get executive pre-approval for degraded mode
- Set clear GO/NO-GO criteria before cutover

The experience taught me that **how you respond to failure matters more than avoiding failure entirely**."

---

### Q6: Pathfinder Cutover Decision

**Question**: We're in late November, test cutover discovers file uploads >50MB fail. December 6 cutover is scheduled. Walk me through your decision.

**Model Answer**:

"This requires structured risk assessment:

**Step 1: Severity Assessment (30 min)**

Issue: File uploads >50MB timeout (90 seconds, ALB timeout is 60s)
- Criticality: HIGH (editors upload large files daily)
- Frequency: MEDIUM (20-30 daily uploads affected)
- Workaround: POSSIBLE (SFTP alternative)
- Data Risk: LOW (no corruption, just failed uploads)

**Step 2: Root Cause** (2 hours)
- Test: Upload 50MB file → times out at 60 seconds
- Diagnosis: ALB idle timeout misconfigured
- Fix: Increase timeout to 300 seconds

**Step 3: Solution Options**

| Option | Time | Risk | Meets Dec 6? |
|--------|------|------|--------------|
| A: Fix ALB timeout | 1 hour | LOW | ✅ YES |
| B: Chunked upload | 2 weeks | MED | ❌ NO |
| C: Workaround only | 0 hours | HIGH | ✅ YES |
| D: Delay cutover | N/A | ZERO | ❌ NO |

**Step 4: Business Impact**

Delay costs:
- On-premises: ₹2-3L/month
- 1CloudHub holding costs
- London Book Fair timeline impact
- Team morale

User impact of proceeding:
- 20-30 daily uploads need SFTP
- Temporary inconvenience
- Doesn't block core work

**Step 5: Decision Matrix**

GO Criteria (All met):
- ✅ Acceptable workaround exists
- ✅ Fix is low-risk and quick
- ✅ No data corruption risk
- ✅ Can hotfix post-migration
- ✅ Delay costs outweigh inconvenience

**My Recommendation: PROCEED (GO)**

**Implementation**:
1. Fix ALB timeout (1 hour)
2. Test with files up to 200MB (4 hours)
3. Provide SFTP workaround instructions
4. Monitor file upload success rate
5. Schedule chunked upload for January

**Communication**:

To Executive (Kris):
```
Issue: Large file uploads timeout
Fix: ALB timeout increased to 300s
Testing: Completed successfully
Workaround: SFTP for any issues
Decision: GO for December 6
Risk: LOW - standard config, tested
```

To Users:
```
Migration proceeding December 6-7.
For very large files (>50MB), SFTP available as backup.
Contact: pathfinder-support@s4carlisle.com
```

**Rollback Triggers**:
- File uploads still failing: ROLLBACK
- Multiple issues compound: REASSESS
- Data loss reported: IMMEDIATE ROLLBACK

**When I'd Recommend NO-GO**:
- Database replication lag not decreasing
- AD trust failing intermittently
- Data validation showing mismatches
- Application crashes every few hours

**Key Principle**:
This is a **risk-informed decision**, not risk-free. We're accepting temporary file upload inconvenience to stay on schedule with a clear mitigation plan."

---

### Q7: Vendor Accountability

**Question**: 1CloudHub is behind schedule on deliverables. How do you handle this?

**Model Answer**:

"Vendor management requires firmness on commitments while maintaining partnership.

**Step 1: Document the Issue**

Gather facts:
- Deliverable: SFTP POC
- Due: October 25
- Actual: Still pending (November 20)
- Delay: 26 days
- Impact: Blocks test cutover prep
- Pattern: Third delay

**Step 2: Internal Assessment**

Is it vendor's fault?
- Did we provide info on time? ✅
- Were requirements clear? ✅
- Did we cause blocking issues? ❌

Contractual position:
- SOW says October 25 delivery
- Milestone payments tied to deliverables
- Escalation process defined

**Step 3: Direct Communication**

Call with Project Manager (Gajalakshmi):

"Gaja, let's discuss the SFTP POC delay:

**Facts**:
- 26 days overdue
- Blocks our December 6 cutover prep
- Third delay this project

**Impact**:
- Production timeline at risk
- Our team blocked
- Client confidence affected

**I need**:
1. Specific completion date
2. Root cause of delay
3. Prevention plan
4. What you need from us

**I commit**:
- Same-day info turnaround
- Weekly checkpoints
- Clear requirements

30-minute meeting tomorrow to review recovery plan?"

**Step 4: Recovery Plan**

Good response would include:
- Root cause acknowledgment
- Dedicated resource commitment
- Specific new deadline (within 7 days)
- Daily standups
- Blocker escalation process

Bad response:
- Vague timelines ("soon")
- Blame shifting
- No concrete plan

**Step 5: Written Confirmation**

```
Subject: SFTP POC Recovery Plan

Deliverable: SFTP POC
New Due Date: November 27, 5 PM IST
Resource: [Name] - dedicated
Daily Standup: 10 AM IST
Escalation: <4 hours to Sultan/Srihari

Critical for December 6 cutover.

Please confirm by reply.

Cc: Sakthivel, Sultan, Srihari
```

**Step 6: Escalation (If Needed)**

Level 1: PM to PM (done above)
Level 2: Leadership (Sakthivel → Srihari)
Level 3: Executive (Kris → 1CloudHub Exec)
Level 4: Contract remediation

**Escalation Email** (Level 2):

```
Subject: Escalation - SFTP POC Delay

Srihari,

SITUATION: 26 days overdue, blocks Dec 6 cutover
ATTEMPTS: 3 discussions, documented plan, inconsistent follow-through
REQUEST: Dedicated resource, completion by Dec 2
CONSEQUENCE: Contract escalation per SOW 8.3

I value our partnership and believe this is resolvable.
Plan by EOD tomorrow?

Cc: Sakthivel, Kris, Gaja
```

**Step 7: Parallel Mitigation**

Don't just wait:
1. Our team researches AWS Transfer Family
2. Test basic SFTP configuration ourselves
3. Identify EC2-based alternative
4. Be ready to take over if needed

**Step 8: Relationship Management**

Principles:
- **Firm on commitments**, not personal
- Professional even when escalating
- Document for protection, not punishment
- Look for win-win solutions
- Acknowledge good work when delivered

**For Pathfinder Specifically**:

Positives:
- They have AWS expertise we need
- Srihari is technically strong
- Some deliverables successful

Concerns:
- Resource allocation issues
- Discovery work inadequate
- Timeline commitments not met

My approach:
1. Direct with Gaja (maintain relationship)
2. Escalate to Srihari if unresolved (respect authority)
3. Involve Kris only if pattern continues
4. Build our internal capability (Sultan's team)
5. Work to make partnership succeed

**When to Part Ways**:
- Pattern with no improvement
- Lack of transparency
- Technical capability concerns
- Adversarial vs partnership

But for Pathfinder, I'd work hard to make it work because:
- Switching mid-project is expensive
- December deadline is tight
- Their technical team is capable
- We need their AWS expertise

**Bottom Line**:
Vendor management = Clear expectations + Firm accountability + Collaborative problem-solving"

---

# PART 4: SCORING RUBRIC

## Hands-On Exercise Scoring (40 points)

### Architecture Design (10 points)
- Network design clarity: 3 points
  - Proper segmentation, Multi-AZ, no IP conflicts
- Service selection rationale: 3 points
  - Justified choices, cost awareness
- Migration strategy: 2 points
  - Zero-downtime approach, rollback plan
- Documentation: 2 points
  - Clear diagrams, risk assessment

### Terraform Code (15 points)
- Module structure: 4 points
  - Organization, reusability, DRY
- Code quality: 4 points
  - Variables, outputs, tags
- Security: 3 points
  - Security groups, encryption, IAM
- Best practices: 2 points
  - Remote state, versioning, comments
- Completeness: 2 points
  - All requirements, functional

### CI/CD Pipeline (10 points)
- Structure: 3 points
  - Logical flow, error handling
- Testing integration: 3 points
  - Validation, security, smoke tests
- Approval gates: 2 points
  - Manual approval, conditional logic
- Rollback capability: 2 points
  - Clear procedure, automated

### Troubleshooting (5 points)
- Problem analysis: 2 points
  - Systematic approach, multiple hypotheses
- Diagnostic steps: 2 points
  - Specific commands, logical progression
- Solutions: 1 point
  - Practical, prioritized

## Technical Interview (40 points)

### AWS/Cloud (12 points)
- Service selection: 4 points
- Architecture design: 4 points
- Migration strategies: 4 points

### Terraform/IaC (8 points)
- Module design: 3 points
- State management: 3 points
- Testing: 2 points

### CI/CD (8 points)
- Pipeline design: 3 points
- Tool knowledge: 3 points
- Automation: 2 points

### Database (6 points)
- Migration strategies: 3 points
- Performance: 2 points
- Security: 1 point

### DR/HA (6 points)
- High availability: 3 points
- Disaster recovery: 3 points

## Behavioral (20 points)

### Problem-Solving (8 points)
- Analytical thinking: 3 points
- Decision-making: 3 points
- Lessons learned: 2 points

### Communication (6 points)
- Clarity: 2 points
- Stakeholder management: 2 points
- Transparency: 2 points

### Project Management (6 points)
- Planning: 2 points
- Execution: 2 points
- Collaboration: 2 points

---

## Score Interpretation

**90-100: Exceptional** - Strong hire, immediate impact, can lead
**80-89: Strong Hire** - Solid skills, good judgment, recommended
**70-79: Acceptable** - Meets minimum, needs some development
**60-69: Borderline** - Significant gaps, requires extensive oversight
**<60: Not Recommended** - Does not meet requirements

---

## Candidate Ranking

Based on resume analysis:

**1. R. Annie Kiruba (90% fit)**
- 9+ years experience, 5+ years DevOps
- Database background (critical for migration)
- Dual-cloud (AWS + Azure)
- Enterprise clients (Siemens, Deloitte, HSBC)
- DR/HA focus
- **Recommendation**: Top choice

**2. Budhi Kamakshi (75% fit)**
- Strong Terraform (TFE, Terratest)
- Event-driven architecture experience
- Modern DevOps practices
- Less migration experience
- **Recommendation**: Strong second

**3. Sathish Kumar M (65% fit)**
- Solid AWS fundamentals
- Good CI/CD with Jenkins
- Limited experience (3 years DevOps)
- No large-scale migration experience
- **Recommendation**: Consider with oversight

---

**END OF INTERVIEW GUIDE**

This document provides comprehensive evaluation framework for DevOps candidates. Key focus areas:
1. Hands-on technical skills (Terraform, AWS, CI/CD)
2. Problem-solving under pressure
3. Communication and stakeholder management
4. Specific fit for Pathfinder migration project

Next steps: Conduct interviews, score using rubric, compare candidates systematically.
